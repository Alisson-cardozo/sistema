package com.safekid.monitor.managers

import android.Manifest
import android.content.Context
import android.database.Cursor
import android.provider.CallLog
import android.provider.ContactsContract
import android.telephony.TelephonyManager
import android.util.Log
import com.safekid.monitor.api.ApiService
import com.safekid.monitor.data.entities.CallData
import com.safekid.monitor.data.entities.LocationData
import com.safekid.monitor.preferences.AppPreferences
import com.safekid.monitor.utils.DeviceUtils
import com.safekid.monitor.utils.PermissionUtils
import kotlinx.coroutines.*
import java.text.SimpleDateFormat
import java.util.*
import kotlin.collections.ArrayList

class CallManager(
    private val context: Context,
    private val apiService: ApiService,
    private val preferences: AppPreferences,
    private val locationManager: LocationManager
) {
    companion object {
        private const val TAG = "CallManager"
        private const val SYNC_INTERVAL = 30 * 60 * 1000L // 30 minutos
        private const val MAX_CALLS_PER_BATCH = 50
        private const val SUSPICIOUS_DURATION_THRESHOLD = 3600 // 1 hora em segundos
        
        // Palavras-chave suspeitas em chamadas (para análise de contatos)
        private val SUSPICIOUS_KEYWORDS = listOf(
            "desconhecido", "privado", "bloqueado", "spam", 
            "telemarketing", "cobrança", "golpe"
        )
    }
    
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var isMonitoring = false
    private var syncJob: Job? = null
    private val dateFormat = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault())
    
    /**
     * Inicia o monitoramento de chamadas
     */
    fun startCallMonitoring() {
        if (!PermissionUtils.hasCallLogPermission(context)) {
            Log.w(TAG, "Permissão READ_CALL_LOG não concedida")
            return
        }
        
        if (isMonitoring) return
        
        isMonitoring = true
        Log.i(TAG, "Iniciando monitoramento de chamadas")
        
        // Sincroniza chamadas existentes na primeira execução
        scope.launch {
            syncExistingCalls()
            schedulePeriodicSync()
        }
    }
    
    /**
     * Para o monitoramento de chamadas
     */
    fun stopCallMonitoring() {
        isMonitoring = false
        syncJob?.cancel()
        Log.i(TAG, "Monitoramento de chamadas parado")
    }
    
    /**
     * Processa uma nova chamada em tempo real
     */
    fun processNewCall(phoneNumber: String?, callState: String, timestamp: Long = System.currentTimeMillis()) {
        if (!isMonitoring) return
        
        phoneNumber?.let { number ->
            scope.launch {
                try {
                    val callData = createCallDataFromState(number, callState, timestamp)
                    callData?.let {
                        processAndSyncCall(it)
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Erro ao processar nova chamada: ${e.message}")
                }
            }
        }
    }
    
    /**
     * Obtém todas as chamadas do dispositivo
     */
    private fun getAllCallLogs(): List<CallData> {
        val calls = mutableListOf<CallData>()
        
        try {
            val cursor: Cursor? = context.contentResolver.query(
                CallLog.Calls.CONTENT_URI,
                arrayOf(
                    CallLog.Calls.NUMBER,
                    CallLog.Calls.CACHED_NAME,
                    CallLog.Calls.TYPE,
                    CallLog.Calls.DATE,
                    CallLog.Calls.DURATION,
                    CallLog.Calls._ID
                ),
                null,
                null,
                "${CallLog.Calls.DATE} DESC"
            )
            
            cursor?.use { c ->
                while (c.moveToNext() && calls.size < MAX_CALLS_PER_BATCH) {
                    val phoneNumber = c.getString(c.getColumnIndexOrThrow(CallLog.Calls.NUMBER)) ?: "Unknown"
                    val contactName = c.getString(c.getColumnIndexOrThrow(CallLog.Calls.CACHED_NAME))
                    val callType = c.getInt(c.getColumnIndexOrThrow(CallLog.Calls.TYPE))
                    val date = c.getLong(c.getColumnIndexOrThrow(CallLog.Calls.DATE))
                    val duration = c.getLong(c.getColumnIndexOrThrow(CallLog.Calls.DURATION))
                    val callId = c.getString(c.getColumnIndexOrThrow(CallLog.Calls._ID))
                    
                    // Filtra apenas chamadas novas (últimas 24h)
                    if (System.currentTimeMillis() - date < 24 * 60 * 60 * 1000) {
                        val callData = CallData(
                            id = "call_${callId}_${date}",
                            phoneNumber = phoneNumber,
                            contactName = contactName ?: getContactName(phoneNumber),
                            callType = mapCallType(callType),
                            duration = duration,
                            timestamp = date,
                            isBlocked = isBlockedNumber(phoneNumber),
                            location = locationManager.getCurrentLocationSync()
                        )
                        
                        calls.add(callData)
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao obter logs de chamadas: ${e.message}")
        }
        
        return calls
    }
    
    /**
     * Cria dados de chamada a partir do estado atual
     */
    private fun createCallDataFromState(phoneNumber: String, callState: String, timestamp: Long): CallData? {
        return when (callState) {
            TelephonyManager.EXTRA_STATE_RINGING -> {
                CallData(
                    id = "call_${UUID.randomUUID()}",
                    phoneNumber = phoneNumber,
                    contactName = getContactName(phoneNumber),
                    callType = CallData.CallType.INCOMING,
                    duration = 0,
                    timestamp = timestamp,
                    isBlocked = isBlockedNumber(phoneNumber),
                    location = locationManager.getCurrentLocationSync()
                )
            }
            TelephonyManager.EXTRA_STATE_OFFHOOK -> {
                // Chamada atendida - será atualizada quando terminar
                null
            }
            TelephonyManager.EXTRA_STATE_IDLE -> {
                // Chamada finalizada - pega da call log
                null
            }
            else -> null
        }
    }
    
    /**
     * Mapeia tipo de chamada do sistema para nossa enum
     */
    private fun mapCallType(systemType: Int): CallData.CallType {
        return when (systemType) {
            CallLog.Calls.INCOMING_TYPE -> CallData.CallType.INCOMING
            CallLog.Calls.OUTGOING_TYPE -> CallData.CallType.OUTGOING
            CallLog.Calls.MISSED_TYPE -> CallData.CallType.MISSED
            CallLog.Calls.REJECTED_TYPE -> CallData.CallType.REJECTED
            CallLog.Calls.BLOCKED_TYPE -> CallData.CallType.BLOCKED
            else -> CallData.CallType.MISSED
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
     * Verifica se é um número suspeito/bloqueado
     */
    private fun isBlockedNumber(phoneNumber: String): Boolean {
        // Verifica números privados, desconhecidos ou com padrões suspeitos
        return phoneNumber.lowercase().let { number ->
            number.contains("private") ||
            number.contains("unknown") ||
            number.contains("blocked") ||
            number.length < 8 ||
            SUSPICIOUS_KEYWORDS.any { keyword -> number.contains(keyword) }
        }
    }
    
    /**
     * Detecta padrões suspeitos nas chamadas
     */
    private fun detectSuspiciousPatterns(calls: List<CallData>): List<SuspiciousPattern> {
        val patterns = mutableListOf<SuspiciousPattern>()
        
        // Análise por número
        val callsByNumber = calls.groupBy { it.phoneNumber }
        
        callsByNumber.forEach { (number, callsForNumber) ->
            // Muitas chamadas do mesmo número
            if (callsForNumber.size > 10) {
                patterns.add(
                    SuspiciousPattern(
                        type = "EXCESSIVE_CALLS",
                        description = "Mais de 10 chamadas do número $number",
                        riskLevel = if (callsForNumber.size > 20) "HIGH" else "MEDIUM",
                        relatedCalls = callsForNumber
                    )
                )
            }
            
            // Chamadas muito longas
            val longCalls = callsForNumber.filter { it.duration > SUSPICIOUS_DURATION_THRESHOLD }
            if (longCalls.isNotEmpty()) {
                patterns.add(
                    SuspiciousPattern(
                        type = "LONG_DURATION",
                        description = "Chamadas muito longas (>1h) com $number",
                        riskLevel = "MEDIUM",
                        relatedCalls = longCalls
                    )
                )
            }
            
            // Horários suspeitos (muito tarde ou muito cedo)
            val suspiciousHours = callsForNumber.filter { call ->
                val hour = Calendar.getInstance().apply { timeInMillis = call.timestamp }.get(Calendar.HOUR_OF_DAY)
                hour < 6 || hour > 22
            }
            if (suspiciousHours.isNotEmpty()) {
                patterns.add(
                    SuspiciousPattern(
                        type = "SUSPICIOUS_HOURS",
                        description = "Chamadas em horários suspeitos com $number",
                        riskLevel = "LOW",
                        relatedCalls = suspiciousHours
                    )
                )
            }
        }
        
        // Números desconhecidos/bloqueados
        val unknownCalls = calls.filter { it.isBlocked || it.contactName == null }
        if (unknownCalls.size > 5) {
            patterns.add(
                SuspiciousPattern(
                    type = "UNKNOWN_NUMBERS",
                    description = "${unknownCalls.size} chamadas de números desconhecidos",
                    riskLevel = if (unknownCalls.size > 15) "HIGH" else "MEDIUM",
                    relatedCalls = unknownCalls
                )
            )
        }
        
        return patterns
    }
    
    /**
     * Processa e sincroniza uma chamada
     */
    private suspend fun processAndSyncCall(callData: CallData) {
        try {
            // Salva localmente primeiro
            saveCallLocally(callData)
            
            // Tenta sincronizar com API
            syncCallToApi(callData)
            
            // Analisa padrões suspeitos
            val patterns = detectSuspiciousPatterns(listOf(callData))
            if (patterns.any { it.riskLevel == "HIGH" }) {
                // Envia alerta imediato
                sendSuspiciousCallAlert(callData, patterns)
            }
            
            Log.d(TAG, "Chamada processada: ${callData.phoneNumber}")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao processar chamada: ${e.message}")
        }
    }
    
    /**
     * Sincroniza chamadas existentes
     */
    private suspend fun syncExistingCalls() {
        try {
            val calls = getAllCallLogs()
            Log.i(TAG, "Sincronizando ${calls.size} chamadas existentes")
            
            calls.forEach { call ->
                saveCallLocally(call)
                delay(100) // Evita sobrecarga
            }
            
            // Sincroniza em batch
            syncCallsToApi(calls)
            
            // Analisa padrões
            val patterns = detectSuspiciousPatterns(calls)
            if (patterns.isNotEmpty()) {
                sendPatternAnalysisReport(patterns)
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao sincronizar chamadas existentes: ${e.message}")
        }
    }
    
    /**
     * Salva chamada localmente
     */
    private fun saveCallLocally(callData: CallData) {
        try {
            // Salva em preferências criptografadas para cache
            val callsJson = preferences.getCachedCalls()
            val calls = mutableListOf<CallData>()
            
            // Adiciona nova chamada
            calls.add(callData)
            
            // Mantém apenas últimas 100 chamadas em cache
            if (calls.size > 100) {
                calls.removeAt(0)
            }
            
            preferences.setCachedCalls(calls)
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao salvar chamada localmente: ${e.message}")
        }
    }
    
    /**
     * Sincroniza uma chamada com a API
     */
    private suspend fun syncCallToApi(callData: CallData) {
        try {
            val deviceId = preferences.getDeviceUuid()
            if (deviceId.isNotEmpty()) {
                apiService.uploadCall(deviceId, callData)
                Log.d(TAG, "Chamada sincronizada com API: ${callData.id}")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao sincronizar chamada com API: ${e.message}")
            // Mantém em cache para retry posterior
        }
    }
    
    /**
     * Sincroniza múltiplas chamadas com a API
     */
    private suspend fun syncCallsToApi(calls: List<CallData>) {
        try {
            val deviceId = preferences.getDeviceUuid()
            if (deviceId.isNotEmpty() && calls.isNotEmpty()) {
                apiService.uploadCalls(deviceId, calls)
                Log.i(TAG, "${calls.size} chamadas sincronizadas com API")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao sincronizar chamadas em batch: ${e.message}")
        }
    }
    
    /**
     * Envia alerta de chamada suspeita
     */
    private suspend fun sendSuspiciousCallAlert(callData: CallData, patterns: List<SuspiciousPattern>) {
        try {
            val deviceId = preferences.getDeviceUuid()
            val alert = mapOf(
                "type" to "SUSPICIOUS_CALL",
                "phoneNumber" to callData.phoneNumber,
                "contactName" to (callData.contactName ?: "Desconhecido"),
                "timestamp" to callData.timestamp,
                "patterns" to patterns.map { it.description },
                "riskLevel" to patterns.maxByOrNull { it.riskLevel }?.riskLevel,
                "location" to callData.location
            )
            
            apiService.sendAlert(deviceId, alert)
            Log.w(TAG, "Alerta de chamada suspeita enviado: ${callData.phoneNumber}")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao enviar alerta: ${e.message}")
        }
    }
    
    /**
     * Envia relatório de análise de padrões
     */
    private suspend fun sendPatternAnalysisReport(patterns: List<SuspiciousPattern>) {
        try {
            val deviceId = preferences.getDeviceUuid()
            val report = mapOf(
                "type" to "CALL_PATTERN_ANALYSIS",
                "timestamp" to System.currentTimeMillis(),
                "patterns" to patterns.map { pattern ->
                    mapOf(
                        "type" to pattern.type,
                        "description" to pattern.description,
                        "riskLevel" to pattern.riskLevel,
                        "callCount" to pattern.relatedCalls.size
                    )
                },
                "summary" to mapOf(
                    "totalPatterns" to patterns.size,
                    "highRiskPatterns" to patterns.count { it.riskLevel == "HIGH" },
                    "mediumRiskPatterns" to patterns.count { it.riskLevel == "MEDIUM" }
                )
            )
            
            apiService.sendAnalysisReport(deviceId, report)
            Log.i(TAG, "Relatório de padrões enviado: ${patterns.size} padrões detectados")
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao enviar relatório: ${e.message}")
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
                    
                    // Sincroniza chamadas em cache
                    val cachedCalls = preferences.getCachedCalls()
                    if (cachedCalls.isNotEmpty()) {
                        syncCallsToApi(cachedCalls)
                    }
                    
                    Log.d(TAG, "Sincronização periódica executada")
                } catch (e: Exception) {
                    Log.e(TAG, "Erro na sincronização periódica: ${e.message}")
                }
            }
        }
    }
    
    /**
     * Obtém estatísticas de chamadas
     */
    fun getCallStatistics(): CallStatistics {
        val cachedCalls = preferences.getCachedCalls()
        val last24h = cachedCalls.filter { 
            System.currentTimeMillis() - it.timestamp < 24 * 60 * 60 * 1000 
        }
        
        return CallStatistics(
            totalCalls = last24h.size,
            incomingCalls = last24h.count { it.callType == CallData.CallType.INCOMING },
            outgoingCalls = last24h.count { it.callType == CallData.CallType.OUTGOING },
            missedCalls = last24h.count { it.callType == CallData.CallType.MISSED },
            blockedCalls = last24h.count { it.isBlocked },
            unknownNumbers = last24h.count { it.contactName == null },
            totalDuration = last24h.sumOf { it.duration },
            averageDuration = if (last24h.isNotEmpty()) last24h.map { it.duration }.average() else 0.0,
            suspiciousPatterns = detectSuspiciousPatterns(last24h).size
        )
    }
    
    // Classes de dados auxiliares
    data class SuspiciousPattern(
        val type: String,
        val description: String,
        val riskLevel: String, // LOW, MEDIUM, HIGH
        val relatedCalls: List<CallData>
    )
    
    data class CallStatistics(
        val totalCalls: Int,
        val incomingCalls: Int,
        val outgoingCalls: Int,
        val missedCalls: Int,
        val blockedCalls: Int,
        val unknownNumbers: Int,
        val totalDuration: Long,
        val averageDuration: Double,
        val suspiciousPatterns: Int
    )
    
    /**
     * Libera recursos
     */
    fun cleanup() {
        stopCallMonitoring()
        scope.cancel()
    }
}

// Extensões para AppPreferences
private fun AppPreferences.getCachedCalls(): List<CallData> {
    // Implementação seria feita com serialização JSON
    // Por now, retorna lista vazia
    return emptyList()
}

private fun AppPreferences.setCachedCalls(calls: List<CallData>) {
    // Implementação seria feita com serialização JSON
    // Por now, não faz nada
}