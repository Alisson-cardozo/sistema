package com.safekid.monitor.data.entities

import java.util.*

/**
 * Entidade que representa dados de uma mensagem
 * Inclui SMS, WhatsApp, Telegram, Instagram, etc
 */
data class MessageData(
    val id: String = UUID.randomUUID().toString(),
    val phoneNumber: String,
    val contactName: String? = null,
    val content: String,
    val messageType: MessageType,
    val direction: MessageDirection,
    val timestamp: Long,
    val hasMedia: Boolean = false,
    val detectedKeywords: List<String> = emptyList(),
    val riskScore: Int = 0, // 0-100
    val appSource: String = "SMS", // SMS, WHATSAPP, TELEGRAM, INSTAGRAM, etc
    val isGroupMessage: Boolean = false,
    val groupName: String? = null,
    val isEmergency: Boolean = false,
    val sentiment: String = "NEUTRAL", // POSITIVE, NEGATIVE, NEUTRAL
    val metadata: MessageMetadata = MessageMetadata()
) {
    
    /**
     * Tipos de mensagem
     */
    enum class MessageType {
        SMS,        // SMS tradicional
        MMS,        // Mensagem multimídia
        CHAT,       // Chat de app (WhatsApp, Telegram)
        VOICE,      // Mensagem de voz
        VIDEO,      // Mensagem de vídeo
        IMAGE,      // Mensagem com imagem
        DOCUMENT,   // Documento/arquivo
        LOCATION,   // Localização compartilhada
        CONTACT,    // Contato compartilhado
        STICKER,    // Sticker/emoji
        GIF,        // GIF animado
        UNKNOWN     // Tipo desconhecido
    }
    
    /**
     * Direção da mensagem
     */
    enum class MessageDirection {
        RECEIVED,   // Mensagem recebida
        SENT        // Mensagem enviada
    }
    
    /**
     * Metadados da mensagem
     */
    data class MessageMetadata(
        val threadId: String? = null,           // ID da conversa/thread
        val messageId: String? = null,          // ID único da mensagem no app
        val replyToId: String? = null,          // ID da mensagem sendo respondida
        val forwardedFrom: String? = null,      // De quem foi encaminhada
        val editedTimestamp: Long? = null,      // Quando foi editada
        val deletedTimestamp: Long? = null,     // Quando foi deletada
        val readTimestamp: Long? = null,        // Quando foi lida
        val deliveredTimestamp: Long? = null,   // Quando foi entregue
        val networkType: String? = null,        // WiFi, 2G, 3G, 4G, 5G
        val batteryLevel: Int? = null,          // Nível da bateria
        val encryptionType: String? = null,     // Tipo de criptografia
        val messageSize: Long? = null,          // Tamanho em bytes
        val mediaCount: Int = 0,                // Número de mídias anexas
        val linkCount: Int = 0,                 // Número de links
        val mentionCount: Int = 0,              // Número de menções
        val reactions: List<String> = emptyList(), // Reações (emojis)
        val isStarred: Boolean = false,         // Se está marcada
        val isArchived: Boolean = false,        // Se está arquivada
        val deviceModel: String? = null,        // Modelo do dispositivo
        val osVersion: String? = null,          // Versão do Android
        val appVersion: String? = null          // Versão do app
    )
    
    /**
     * Obtém resumo do conteúdo (primeiros 50 caracteres)
     */
    fun getContentPreview(): String {
        return when {
            content.length <= 50 -> content
            else -> "${content.take(47)}..."
        }
    }
    
    /**
     * Verifica se é uma mensagem suspeita
     */
    fun isSuspicious(): Boolean {
        return riskScore >= 50 || 
               isEmergency ||
               detectedKeywords.any { keyword ->
                   listOf("drogas", "suicidio", "fugir", "bullying", "sexo").any { 
                       keyword.contains(it, ignoreCase = true) 
                   }
               }
    }
    
    /**
     * Obtém categoria de risco
     */
    fun getRiskCategory(): String {
        return when {
            riskScore >= 80 -> "HIGH"
            riskScore >= 50 -> "MEDIUM"
            riskScore >= 20 -> "LOW"
            else -> "SAFE"
        }
    }
    
    /**
     * Verifica se contém link
     */
    fun hasLinks(): Boolean {
        val linkPatterns = listOf(
            "http://", "https://", "www.", ".com", ".org", ".net", ".br",
            "bit.ly", "tinyurl", "t.co", "instagram.com", "facebook.com"
        )
        return linkPatterns.any { pattern ->
            content.contains(pattern, ignoreCase = true)
        }
    }
    
    /**
     * Conta palavras na mensagem
     */
    fun getWordCount(): Int {
        return content.trim().split("\\s+".toRegex()).filter { it.isNotBlank() }.size
    }
    
    /**
     * Verifica se é mensagem noturna (22h-6h)
     */
    fun isNightMessage(): Boolean {
        val calendar = Calendar.getInstance().apply { timeInMillis = timestamp }
        val hour = calendar.get(Calendar.HOUR_OF_DAY)
        return hour >= 22 || hour <= 6
    }
    
    /**
     * Converte para Map para envio à API
     */
    fun toApiMap(): Map<String, Any?> {
        return mapOf(
            "id" to id,
            "phoneNumber" to phoneNumber,
            "contactName" to contactName,
            "content" to content,
            "messageType" to messageType.name,
            "direction" to direction.name,
            "timestamp" to timestamp,
            "hasMedia" to hasMedia,
            "detectedKeywords" to detectedKeywords,
            "riskScore" to riskScore,
            "appSource" to appSource,
            "isGroupMessage" to isGroupMessage,
            "groupName" to groupName,
            "isEmergency" to isEmergency,
            "sentiment" to sentiment,
            "metadata" to mapOf(
                "threadId" to metadata.threadId,
                "messageId" to metadata.messageId,
                "replyToId" to metadata.replyToId,
                "forwardedFrom" to metadata.forwardedFrom,
                "editedTimestamp" to metadata.editedTimestamp,
                "deletedTimestamp" to metadata.deletedTimestamp,
                "readTimestamp" to metadata.readTimestamp,
                "deliveredTimestamp" to metadata.deliveredTimestamp,
                "networkType" to metadata.networkType,
                "batteryLevel" to metadata.batteryLevel,
                "encryptionType" to metadata.encryptionType,
                "messageSize" to metadata.messageSize,
                "mediaCount" to metadata.mediaCount,
                "linkCount" to metadata.linkCount,
                "mentionCount" to metadata.mentionCount,
                "reactions" to metadata.reactions,
                "isStarred" to metadata.isStarred,
                "isArchived" to metadata.isArchived,
                "deviceModel" to metadata.deviceModel,
                "osVersion" to metadata.osVersion,
                "appVersion" to metadata.appVersion
            )
        )
    }
    
    /**
     * Cria cópia com novos dados
     */
    fun copyWith(
        phoneNumber: String? = null,
        contactName: String? = null,
        content: String? = null,
        messageType: MessageType? = null,
        direction: MessageDirection? = null,
        timestamp: Long? = null,
        hasMedia: Boolean? = null,
        detectedKeywords: List<String>? = null,
        riskScore: Int? = null,
        appSource: String? = null,
        isGroupMessage: Boolean? = null,
        groupName: String? = null,
        isEmergency: Boolean? = null,
        sentiment: String? = null,
        metadata: MessageMetadata? = null
    ): MessageData {
        return copy(
            phoneNumber = phoneNumber ?: this.phoneNumber,
            contactName = contactName ?: this.contactName,
            content = content ?: this.content,
            messageType = messageType ?: this.messageType,
            direction = direction ?: this.direction,
            timestamp = timestamp ?: this.timestamp,
            hasMedia = hasMedia ?: this.hasMedia,
            detectedKeywords = detectedKeywords ?: this.detectedKeywords,
            riskScore = riskScore ?: this.riskScore,
            appSource = appSource ?: this.appSource,
            isGroupMessage = isGroupMessage ?: this.isGroupMessage,
            groupName = groupName ?: this.groupName,
            isEmergency = isEmergency ?: this.isEmergency,
            sentiment = sentiment ?: this.sentiment,
            metadata = metadata ?: this.metadata
        )
    }
    
    companion object {
        /**
         * Cria MessageData a partir de Map da API
         */
        fun fromApiMap(map: Map<String, Any?>): MessageData {
            val metadataMap = map["metadata"] as? Map<String, Any?> ?: emptyMap()
            val keywords = map["detectedKeywords"] as? List<*> ?: emptyList<String>()
            val reactions = metadataMap["reactions"] as? List<*> ?: emptyList<String>()
            
            return MessageData(
                id = map["id"] as? String ?: UUID.randomUUID().toString(),
                phoneNumber = map["phoneNumber"] as? String ?: "",
                contactName = map["contactName"] as? String,
                content = map["content"] as? String ?: "",
                messageType = MessageType.valueOf(map["messageType"] as? String ?: "UNKNOWN"),
                direction = MessageDirection.valueOf(map["direction"] as? String ?: "RECEIVED"),
                timestamp = (map["timestamp"] as? Number)?.toLong() ?: System.currentTimeMillis(),
                hasMedia = map["hasMedia"] as? Boolean ?: false,
                detectedKeywords = keywords.filterIsInstance<String>(),
                riskScore = (map["riskScore"] as? Number)?.toInt() ?: 0,
                appSource = map["appSource"] as? String ?: "SMS",
                isGroupMessage = map["isGroupMessage"] as? Boolean ?: false,
                groupName = map["groupName"] as? String,
                isEmergency = map["isEmergency"] as? Boolean ?: false,
                sentiment = map["sentiment"] as? String ?: "NEUTRAL",
                metadata = MessageMetadata(
                    threadId = metadataMap["threadId"] as? String,
                    messageId = metadataMap["messageId"] as? String,
                    replyToId = metadataMap["replyToId"] as? String,
                    forwardedFrom = metadataMap["forwardedFrom"] as? String,
                    editedTimestamp = (metadataMap["editedTimestamp"] as? Number)?.toLong(),
                    deletedTimestamp = (metadataMap["deletedTimestamp"] as? Number)?.toLong(),
                    readTimestamp = (metadataMap["readTimestamp"] as? Number)?.toLong(),
                    deliveredTimestamp = (metadataMap["deliveredTimestamp"] as? Number)?.toLong(),
                    networkType = metadataMap["networkType"] as? String,
                    batteryLevel = (metadataMap["batteryLevel"] as? Number)?.toInt(),
                    encryptionType = metadataMap["encryptionType"] as? String,
                    messageSize = (metadataMap["messageSize"] as? Number)?.toLong(),
                    mediaCount = (metadataMap["mediaCount"] as? Number)?.toInt() ?: 0,
                    linkCount = (metadataMap["linkCount"] as? Number)?.toInt() ?: 0,
                    mentionCount = (metadataMap["mentionCount"] as? Number)?.toInt() ?: 0,
                    reactions = reactions.filterIsInstance<String>(),
                    isStarred = metadataMap["isStarred"] as? Boolean ?: false,
                    isArchived = metadataMap["isArchived"] as? Boolean ?: false,
                    deviceModel = metadataMap["deviceModel"] as? String,
                    osVersion = metadataMap["osVersion"] as? String,
                    appVersion = metadataMap["appVersion"] as? String
                )
            )
        }
        
        /**
         * Cria MessageData vazio para testes
         */
        fun empty(): MessageData {
            return MessageData(
                phoneNumber = "",
                content = "",
                messageType = MessageType.UNKNOWN,
                direction = MessageDirection.RECEIVED,
                timestamp = System.currentTimeMillis()
            )
        }
        
        /**
         * Valida se os dados estão consistentes
         */
        fun isValid(messageData: MessageData): Boolean {
            return messageData.phoneNumber.isNotEmpty() &&
                   messageData.content.isNotEmpty() &&
                   messageData.timestamp > 0 &&
                   messageData.riskScore in 0..100
        }
    }
}