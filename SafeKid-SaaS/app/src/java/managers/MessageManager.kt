package com.safekid.monitor.managers

import android.Manifest
import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.provider.ContactsContract
import android.provider.Telephony
import android.util.Log
import com.safekid.monitor.api.ApiService
import com.safekid.monitor.data.entities.MessageData
import com.safekid.monitor.data.entities.LocationData
import com.safekid.monitor.preferences.AppPreferences
import com.safekid.monitor.utils.DeviceUtils
import com.safekid.monitor.utils.PermissionUtils
import kotlinx.coroutines.*
import java.text.SimpleDateFormat
import java.util.*
import kotlin.math.min

class MessageManager(
    private val context: Context,
    private val apiService: ApiService,
    private val preferences: AppPreferences,
    private val locationManager: LocationManager
) {
    companion object {
        private const val TAG = "MessageManager"
        private const val SYNC_INTERVAL = 30 * 60 * 1000L // 30 minutos
        private const val MAX_MESSAGES_PER_BATCH = 100
        private const val HIGH_RISK_THRESHOLD = 70
        private const val MEDIUM_RISK_THRESHOLD = 40
        
        // Palavras-chave suspeitas categorizadas por risco
        private val HIGH_RISK_KEYWORDS = listOf(
            "drogas", "maconha", "cocaina", "crack", "ecstasy", "lsd",
            "suicidio", "suicidar", "morte", "morrer", "matar",
            "sexo", "transar", "virgindade", "nudes", "pelada", "pelado",
            "fugir", "sair de casa", "não volto", "vou embora",
            "bullying", "bater", "machucar", "violencia", "ameaça"
        )
        
        private val MEDIUM_RISK_KEYWORDS = listOf(
            "bebida", "cerveja", "vodka", "whisky", "alcool", "beber",
            "cigarro", "fumar", "vape", "tabaco",
            "festa", "balada", "rave", "show", "evento",
            "dinheiro", "emprestimo", "divida", "comprar", "vender",
            "escola", "faltar", "matar aula", "cabular", "notas",
            "pais", "familia", "brigar", "discussao", "problema"
        )
        
        private val LOW_RISK_KEYWORDS = listOf(
            "namorado", "namorada", "crush", "paquera", "encontro",
            "shopping", "cinema", "praia", "parque", "diversao",
            "jogo", "game", "youtube", "tiktok", "instagram",
            "musica", "filme", "serie", "livro", "estudo"
        )
        
        // Padrões de números suspeitos
        private val SPAM_PATTERNS = listOf(
            "^\\d{5}$".toRegex(), // Números de 5 dígitos
            "^\\d{4}$".toRegex(), // Números de 4 dígitos  
            "^0800".toRegex(),    // 0800
            "^4004".toRegex(),    // 4004
            "^3003".toRegex()     // 3003
        )
    }
    
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var isMonitoring = false
    private var syncJob: Job? = null
    private val dateFormat = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault())
    
    /**
     * Inicia o monitoramento de SMS
     */
    fun startSmsMonitoring() {
        if (!PermissionUtils.hasSmsPermission(context)) {
            Log.w(TAG, "Permissão READ_SMS não concedida")
            return
        }
        
        if (isMonitoring) return
        
        isMonitoring = true
        Log.i(TAG, "Iniciando monitoramento de SMS")
        
        // Sincroniza mensagens existentes na primeira execução
        scope.launch {
            syncExistingMessages()
            schedulePeriodicSync()
        }
    }
    
    /**
     * Para o monitoramento de SMS
     */
    fun stopSmsMonitoring() {
        isMonitoring = false
        syncJob?.cancel()
        Log.i(TAG, "Monitoramento de SMS parado")
    }
    
    /**
     * Processa uma nova mensagem em tempo real
     */
    fun processNewMessage(
        phoneNumber: String,
        content: String,
        timestamp: Long = System.currentTimeMillis(),
        isReceived: Boolean = true
    ) {
        if (!isMonitoring) return
        
        scope.launch {
            try {
                val messageData = MessageData(
                    id = "msg_${UUID.randomUUID()}",
                    phoneNumber = phoneNumber,
                    contactName = getContactName(phoneNumber),
                    content = content,
                    messageType = MessageData.MessageType.SMS,
                    direction = if (isReceived) MessageData.MessageDirection.RECEIVED else MessageData.MessageDirection.SENT,
                    timestamp = timestamp,
                    hasMedia = false,
                    detectedKeywords = detectKeywords(content),
                    riskScore = calculateRiskScore(content, phoneNumber)
                )
                
                processAndSyncMessage(messageData)
            } catch (e: Exception) {
                Log.e(TAG, "Erro ao processar nova mensagem: ${e.message}")
            }
        }
    }
    
    /**
     * Obtém todas as mensagens SMS do dispositivo
     */
    private fun getAllMessages(): List<MessageData> {
        val messages = mutableListOf<MessageData>()
        
        try {
            // SMS recebidos
            val inboxMessages = getMessagesFromUri(Telephony.Sms.Inbox.CONTENT_URI, MessageData.MessageDirection.RECEIVED)
            messages.addAll(inboxMessages)
            
            // SMS enviados
            val sentMessages = getMessagesFromUri(Telephony.Sms.Sent.CONTENT_URI, MessageData.MessageDirection.SENT)
            messages.addAll(sentMessages)
            
            // Ordena por timestamp (mais recentes primeiro)
            return messages.sortedByDescending { it.timestamp }.take(MAX_MESSAGES_PER_BATCH)
            
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao obter mensagens SMS: ${e.message}")
            return emptyList()
        }
    }
    
    /**
     * Obtém mensagens de uma URI específica
     */
    private fun getMessagesFromUri(uri: Uri, direction: MessageData.MessageDirection): List<MessageData> {
        val messages = mutableListOf<MessageData>()
        
        try {
            val cursor: Cursor? = context.contentResolver.query(
                uri,
                arrayOf(
                    Telephony.Sms._ID,
                    Telephony.Sms.ADDRESS,
                    Telephony.Sms.BODY,
                    Telephony.Sms.DATE,
                    Telephony.Sms.TYPE,
                    Telephony.Sms.READ
                ),
                null,
                null,
                "${Telephony.Sms.DATE} DESC"
            )
            
            cursor?.use { c ->
                while (c.moveToNext() && messages.size < MAX_MESSAGES_PER_BATCH) {
                    val id = c.getString(c.getColumnIndexOrThrow(Telephony.Sms._ID))
                    val phoneNumber = c.getString(c.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)) ?: "Unknown"
                    val content = c.getString(c.getColumnIndexOrThrow(Telephony.Sms.BODY)) ?: ""
                    val date = c.getLong(c.getColumnIndexOrThrow(Telephony.Sms.DATE))
                    val type = c.getInt(c.getColumnIndexOrThrow(Telephony.Sms.TYPE))
                    
                    // Filtra apenas mensagens das últimas 24h
                    if (System.currentTimeMillis() - date < 24 * 60 * 60 * 1000) {
                        val messageData = MessageData(
                            id = "sms_${id}_${date}",
                            phoneNumber = phoneNumber,
                            contactName = getContactName(phoneNumber),
                            content = content,
                            messageType = MessageData.MessageType.SMS,
                            direction = direction,
                            timestamp = date,
                            hasMedia = false,
                            detectedKeywords = detectKeywords(content),
                            riskScore = calculateRiskScore(content, phoneNumber)
                        )
                        
                        messages.add(messageData)
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao obter mensagens da URI $uri: ${e.message}")
        }
        
        return messages
    }
    
    /**
     * Detecta palavras-chave suspeitas no conteúdo
     */
    private fun detectKeywords(content: String): List<String> {
        val detectedKeywords = mutableListOf<String>()
        val contentLower = content.lowercase()
        
        // Verifica palavras de alto risco
        HIGH_RISK_KEYWORDS.forEach { keyword ->
            if (contentLower.contains(keyword.lowercase())) {
                detectedKeywords.add(keyword)
            }
        }
        
        // Verifica palavras de médio risco
        MEDIUM_RISK_KEYWORDS.forEach { keyword ->
            if (contentLower.contains(keyword.lowercase())) {
                detectedKeywords.add(keyword)
            }
        }
        
        // Verifica palavras de baixo risco
        LOW_RISK_KEYWORDS.forEach { keyword ->
            if (contentLower.contains(keyword.lowercase())) {
                detectedKeywords.add(keyword)
            }
        }
        
        return detectedKeywords.distinct()
    }
    
    /**
     * Calcula score de risco da mensagem (0-100)
     */
    private fun calculateRiskScore(content: String, phoneNumber: String): Int {
        var riskScore = 0
        val contentLower = content.lowercase()
        
        // Pontuação por palavras-chave
        HIGH_RISK_KEYWORDS.forEach { keyword ->
            if (contentLower.contains(keyword.lowercase())) {
                riskScore += 25
            }
        }
        
        MEDIUM_RISK_KEYWORDS.forEach { keyword ->
            if (contentLower.contains(keyword.lowercase())) {
                riskScore += 15
            }
        }
        
        LOW_RISK_KEYWORDS.forEach { keyword ->
            if (contentLower.contains(keyword.lowercase())) {
                riskScore += 5
            }
        }
        
        // Pontuação por características do remetente
        if (isSpamNumber(phoneNumber)) {
            riskScore += 20
        }
        
        if (getContactName(phoneNumber) == null) {
            riskScore += 10 // Número desconhecido
        }
        
        // Pontuação por características do conteúdo
        if (content.length > 500) {
            riskScore += 5 // Mensagem muito longa
        }
        
        if (contentLower.contains("http") || contentLower.contains("www")) {
            riskScore += 10 // Contém links
        }
        
        if (content.count { it.isUpperCase() } > content.length * 0.5) {
            riskScore += 5 // Muito texto em maiúscula
        }
        
        // Padrões de urgência
        val urgencyPatterns = listOf("urgente", "rapido", "agora", "imediato", "socorro", "ajuda")
        urgencyPatterns.forEach { pattern ->
            if (contentLower.contains(pattern)) {
                riskScore += 8
            }
        }
        
        return min(riskScore, 100)
    }
    
    /**
     * Verifica se é um número de spam
     */
    private fun isSpamNumber(phoneNumber: String): Boolean {
        return SPAM_PATTERNS.any { pattern ->
            pattern.matches(phoneNumber)
        }
    }
    
    /**
     * Obtém nome do contato pelo número
     */
    private fun getContactName(phoneNumber: String): String? {
        try {
            val cursor = context.contentResolver.query(
                ContactsContract.PhoneLookup.CONTENT_FILTER_URI.buildUpon()
                    .appendPath(phoneNumber).build(),
                arrayOf(ContactsContract.PhoneLookup.DISPLAY_NAME),
                null,
                null,
                null
            )
            
            cursor?.use {
                if (it.moveToFirst()) {
                    return it.getString(it.getColumnIndexOrThrow(ContactsContract.PhoneLookup.DISPLAY_NAME))
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Erro ao buscar nome do contato: ${e.message}")
        }
        return null
    }
    
    /**
     * Análise de sentimento básica
     */
    private fun analyzeSentiment(content: String): SentimentResult {
        val contentLower = content.lowercase()
        
        val positiveWords = listOf("feliz", "alegre", "amor", "obrigado", "parabens", "otimo", "bom", "legal")
        val negativeWords = listOf("triste", "raiva", "odio", "ruim", "terrivel", "pessimo", "chateado", "depressao")
        val neutralWords = listOf("ok", "tudo bem", "normal", "talvez", "nao sei", "pode ser")
        
        val positiveCount = positiveWords.count { contentLower.contains(it) }
        val negativeCount = negativeWords.count { contentLower.contains(it) }
        val neutralCount = neutralWords.count { contentLower.contains(it) }
        
        return when {
            positiveCount > negativeCount && positiveCount > neutralCount -> 
                SentimentResult("POSITIVE", positiveCount * 20)
            negativeCount > positiveCount && negativeCount > neutralCount -> 
                SentimentResult("NEGATIVE", negativeCount * 20)
            else -> 
                SentimentResult("NEUTRAL", 10)
        }
    }
    
    /**
     * Processa e sincroniza uma mensagem
     */
    private suspend fun processAndSyncMessage(messageData: MessageData) {
        try {
            // Salva localmente primeiro
            saveMessageLocally(messageData)
            
            // Tenta sincronizar com API
            syncMessageToApi(messageData)
            
            // Verifica se precisa enviar alerta
            if (messageData.riskScore >= HIGH_RISK_THRESHOLD) {
                sendHighRiskMessageAlert(messageData)
            } else if (messageData.riskScore >= MEDIUM_RISK_THRESHOLD) {
                sendMediumRiskMessageAlert(messageData)
            }
            
            Log.d(TAG, "Mensagem processada: ${messageData.phoneNumber} (Risk: ${messageData.riskScore})")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao processar mensagem: ${e.message}")
        }
    }
    
    /**
     * Sincroniza mensagens existentes
     */
    private suspend fun syncExistingMessages() {
        try {
            val messages = getAllMessages()
            Log.i(TAG, "Sincronizando ${messages.size} mensagens existentes")
            
            messages.forEach { message ->
                saveMessageLocally(message)
                delay(50) // Evita sobrecarga
            }
            
            // Sincroniza em batch
            syncMessagesToApi(messages)
            
            // Gera relatório de análise
            generateMessageAnalysisReport(messages)
            
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao sincronizar mensagens existentes: ${e.message}")
        }
    }
    
    /**
     * Salva mensagem localmente
     */
    private fun saveMessageLocally(messageData: MessageData) {
        try {
            // Salva em preferências criptografadas para cache
            val messagesJson = preferences.getCachedMessages()
            val messages = mutableListOf<MessageData>()
            
            // Adiciona nova mensagem
            messages.add(messageData)
            
            // Mantém apenas últimas 200 mensagens em cache
            if (messages.size > 200) {
                messages.removeAt(0)
            }
            
            preferences.setCachedMessages(messages)
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao salvar mensagem localmente: ${e.message}")
        }
    }
    
    /**
     * Sincroniza uma mensagem com a API
     */
    private suspend fun syncMessageToApi(messageData: MessageData) {
        try {
            val deviceId = preferences.getDeviceUuid()
            if (deviceId.isNotEmpty()) {
                apiService.uploadMessage(deviceId, messageData)
                Log.d(TAG, "Mensagem sincronizada com API: ${messageData.id}")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao sincronizar mensagem com API: ${e.message}")
            // Mantém em cache para retry posterior
        }
    }
    
    /**
     * Sincroniza múltiplas mensagens com a API
     */
    private suspend fun syncMessagesToApi(messages: List<MessageData>) {
        try {
            val deviceId = preferences.getDeviceUuid()
            if (deviceId.isNotEmpty() && messages.isNotEmpty()) {
                apiService.uploadMessages(deviceId, messages)
                Log.i(TAG, "${messages.size} mensagens sincronizadas com API")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao sincronizar mensagens em batch: ${e.message}")
        }
    }
    
    /**
     * Envia alerta de mensagem de alto risco
     */
    private suspend fun sendHighRiskMessageAlert(messageData: MessageData) {
        try {
            val deviceId = preferences.getDeviceUuid()
            val alert = mapOf(
                "type" to "HIGH_RISK_MESSAGE",
                "phoneNumber" to messageData.phoneNumber,
                "contactName" to (messageData.contactName ?: "Desconhecido"),
                "content" to messageData.content.take(100), // Primeiros 100 caracteres
                "riskScore" to messageData.riskScore,
                "detectedKeywords" to messageData.detectedKeywords,
                "timestamp" to messageData.timestamp,
                "direction" to messageData.direction.name,
                "location" to locationManager.getCurrentLocationSync()
            )
            
            apiService.sendAlert(deviceId, alert)
            Log.w(TAG, "Alerta de mensagem de alto risco enviado: ${messageData.phoneNumber}")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao enviar alerta de alto risco: ${e.message}")
        }
    }
    
    /**
     * Envia alerta de mensagem de médio risco
     */
    private suspend fun sendMediumRiskMessageAlert(messageData: MessageData) {
        try {
            val deviceId = preferences.getDeviceUuid()
            val alert = mapOf(
                "type" to "MEDIUM_RISK_MESSAGE",
                "phoneNumber" to messageData.phoneNumber,
                "contactName" to (messageData.contactName ?: "Desconhecido"),
                "riskScore" to messageData.riskScore,
                "detectedKeywords" to messageData.detectedKeywords,
                "timestamp" to messageData.timestamp,
                "direction" to messageData.direction.name
            )
            
            apiService.sendAlert(deviceId, alert)
            Log.i(TAG, "Alerta de mensagem de médio risco enviado: ${messageData.phoneNumber}")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao enviar alerta de médio risco: ${e.message}")
        }
    }
    
    /**
     * Gera relatório de análise de mensagens
     */
    private suspend fun generateMessageAnalysisReport(messages: List<MessageData>) {
        try {
            val deviceId = preferences.getDeviceUuid()
            
            val highRiskMessages = messages.filter { it.riskScore >= HIGH_RISK_THRESHOLD }
            val mediumRiskMessages = messages.filter { it.riskScore >= MEDIUM_RISK_THRESHOLD && it.riskScore < HIGH_RISK_THRESHOLD }
            val lowRiskMessages = messages.filter { it.riskScore < MEDIUM_RISK_THRESHOLD }
            
            val allKeywords = messages.flatMap { it.detectedKeywords }
            val keywordFrequency = allKeywords.groupingBy { it }.eachCount()
            
            val unknownContacts = messages.filter { it.contactName == null }
            val spamMessages = messages.filter { isSpamNumber(it.phoneNumber) }
            
            val report = mapOf(
                "type" to "MESSAGE_ANALYSIS_REPORT",
                "timestamp" to System.currentTimeMillis(),
                "totalMessages" to messages.size,
                "riskDistribution" to mapOf(
                    "high" to highRiskMessages.size,
                    "medium" to mediumRiskMessages.size,
                    "low" to lowRiskMessages.size
                ),
                "directionBreakdown" to mapOf(
                    "received" to messages.count { it.direction == MessageData.MessageDirection.RECEIVED },
                    "sent" to messages.count { it.direction == MessageData.MessageDirection.SENT }
                ),
                "topKeywords" to keywordFrequency.toList().sortedByDescending { it.second }.take(10),
                "unknownContacts" to unknownContacts.size,
                "spamMessages" to spamMessages.size,
                "averageRiskScore" to if (messages.isNotEmpty()) messages.map { it.riskScore }.average() else 0.0,
                "sentimentAnalysis" to mapOf(
                    "positive" to messages.count { analyzeSentiment(it.content).sentiment == "POSITIVE" },
                    "negative" to messages.count { analyzeSentiment(it.content).sentiment == "NEGATIVE" },
                    "neutral" to messages.count { analyzeSentiment(it.content).sentiment == "NEUTRAL" }
                )
            )
            
            apiService.sendAnalysisReport(deviceId, report)
            Log.i(TAG, "Relatório de análise de mensagens enviado")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao gerar relatório de análise: ${e.message}")
        }
    }
    
    /**
     * Agenda sincronização periódica
     */
    private fun schedulePeriodicSync() {
        syncJob = scope.launch {
            while (isMonitoring) {
                try {
                    delay(SYNC_INTERVAL)
                    
                    // Sincroniza mensagens em cache
                    val cachedMessages = preferences.getCachedMessages()
                    if (cachedMessages.isNotEmpty()) {
                        syncMessagesToApi(cachedMessages)
                    }
                    
                    Log.d(TAG, "Sincronização periódica de mensagens executada")
                } catch (e: Exception) {
                    Log.e(TAG, "Erro na sincronização periódica de mensagens: ${e.message}")
                }
            }
        }
    }
    
    /**
     * Obtém estatísticas de mensagens
     */
    fun getMessageStatistics(): MessageStatistics {
        val cachedMessages = preferences.getCachedMessages()
        val last24h = cachedMessages.filter { 
            System.currentTimeMillis() - it.timestamp < 24 * 60 * 60 * 1000 
        }
        
        val highRisk = last24h.filter { it.riskScore >= HIGH_RISK_THRESHOLD }
        val mediumRisk = last24h.filter { it.riskScore >= MEDIUM_RISK_THRESHOLD && it.riskScore < HIGH_RISK_THRESHOLD }
        
        return MessageStatistics(
            totalMessages = last24h.size,
            receivedMessages = last24h.count { it.direction == MessageData.MessageDirection.RECEIVED },
            sentMessages = last24h.count { it.direction == MessageData.MessageDirection.SENT },
            highRiskMessages = highRisk.size,
            mediumRiskMessages = mediumRisk.size,
            unknownContacts = last24h.count { it.contactName == null },
            spamMessages = last24h.count { isSpamNumber(it.phoneNumber) },
            averageRiskScore = if (last24h.isNotEmpty()) last24h.map { it.riskScore }.average() else 0.0,
            totalKeywords = last24h.flatMap { it.detectedKeywords }.distinct().size,
            mostCommonKeywords = last24h.flatMap { it.detectedKeywords }
                .groupingBy { it }.eachCount()
                .toList().sortedByDescending { it.second }.take(5)
        )
    }
    
    /**
     * Busca mensagens por critérios
     */
    fun searchMessages(
        phoneNumber: String? = null,
        keyword: String? = null,
        minRiskScore: Int? = null,
        startDate: Long? = null,
        endDate: Long? = null
    ): List<MessageData> {
        val cachedMessages = preferences.getCachedMessages()
        
        return cachedMessages.filter { message ->
            (phoneNumber == null || message.phoneNumber.contains(phoneNumber, ignoreCase = true)) &&
            (keyword == null || message.content.contains(keyword, ignoreCase = true) || 
             message.detectedKeywords.any { it.contains(keyword, ignoreCase = true) }) &&
            (minRiskScore == null || message.riskScore >= minRiskScore) &&
            (startDate == null || message.timestamp >= startDate) &&
            (endDate == null || message.timestamp <= endDate)
        }.sortedByDescending { it.timestamp }
    }
    
    /**
     * Obtém conversas agrupadas por contato
     */
    fun getConversations(): List<Conversation> {
        val cachedMessages = preferences.getCachedMessages()
        val messagesByNumber = cachedMessages.groupBy { it.phoneNumber }
        
        return messagesByNumber.map { (phoneNumber, messages) ->
            val sortedMessages = messages.sortedByDescending { it.timestamp }
            val lastMessage = sortedMessages.firstOrNull()
            val highestRisk = messages.maxByOrNull { it.riskScore }?.riskScore ?: 0
            
            Conversation(
                phoneNumber = phoneNumber,
                contactName = lastMessage?.contactName,
                messageCount = messages.size,
                lastMessage = lastMessage,
                highestRiskScore = highestRisk,
                hasUnreadHighRisk = messages.any { it.riskScore >= HIGH_RISK_THRESHOLD },
                keywords = messages.flatMap { it.detectedKeywords }.distinct()
            )
        }.sortedByDescending { it.lastMessage?.timestamp ?: 0 }
    }
    
    // Classes de dados auxiliares
    data class SentimentResult(
        val sentiment: String, // POSITIVE, NEGATIVE, NEUTRAL
        val confidence: Int    // 0-100
    )
    
    data class MessageStatistics(
        val totalMessages: Int,
        val receivedMessages: Int,
        val sentMessages: Int,
        val highRiskMessages: Int,
        val mediumRiskMessages: Int,
        val unknownContacts: Int,
        val spamMessages: Int,
        val averageRiskScore: Double,
        val totalKeywords: Int,
        val mostCommonKeywords: List<Pair<String, Int>>
    )
    
    data class Conversation(
        val phoneNumber: String,
        val contactName: String?,
        val messageCount: Int,
        val lastMessage: MessageData?,
        val highestRiskScore: Int,
        val hasUnreadHighRisk: Boolean,
        val keywords: List<String>
    )
    
    /**
     * Libera recursos
     */
    fun cleanup() {
        stopSmsMonitoring()
        scope.cancel()
    }
}

// Extensões para AppPreferences (implementação seria com JSON)
private fun AppPreferences.getCachedMessages(): List<MessageData> {
    // Implementação seria feita com serialização JSON
    return emptyList()
}

private fun AppPreferences.setCachedMessages(messages: List<MessageData>) {
    // Implementação seria feita com serialização JSON
}