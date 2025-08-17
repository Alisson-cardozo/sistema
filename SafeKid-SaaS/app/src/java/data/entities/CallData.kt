package com.safekid.monitor.data.entities

import java.util.*

/**
 * Entidade que representa dados de uma chamada telefônica
 * Inclui chamadas de celular, WhatsApp, Telegram e outros apps
 */
data class CallData(
    val id: String = UUID.randomUUID().toString(),
    val phoneNumber: String,
    val contactName: String? = null,
    val callType: CallType,
    val duration: Long, // em segundos
    val timestamp: Long,
    val isBlocked: Boolean = false,
    val location: LocationData? = null,
    val appSource: String = "PHONE", // PHONE, WHATSAPP, TELEGRAM, SKYPE, etc
    val isEmergency: Boolean = false,
    val riskScore: Int = 0, // 0-100
    val metadata: CallMetadata = CallMetadata()
) {
    
    /**
     * Tipos de chamada
     */
    enum class CallType {
        INCOMING,    // Chamada recebida
        OUTGOING,    // Chamada feita
        MISSED,      // Chamada perdida
        REJECTED,    // Chamada rejeitada
        BLOCKED,     // Chamada bloqueada
        VOICEMAIL,   // Caixa postal
        UNKNOWN      // Tipo desconhecido
    }
    
    /**
     * Metadados adicionais da chamada
     */
    data class CallMetadata(
        val callerId: String? = null,        // ID do chamador se disponível
        val networkType: String? = null,     // WiFi, 2G, 3G, 4G, 5G
        val networkOperator: String? = null, // Nome da operadora
        val batteryLevel: Int? = null,       // Nível da bateria durante a chamada
        val isRoaming: Boolean = false,      // Se estava em roaming
        val callQuality: String? = null,     // HD, Normal, Poor
        val endReason: String? = null,       // USER_HANGUP, NETWORK_ERROR, etc
        val deviceModel: String? = null,     // Modelo do dispositivo
        val osVersion: String? = null,       // Versão do Android
        val appVersion: String? = null       // Versão do app de origem
    )
    
    /**
     * Converte duração em formato legível
     */
    fun getDurationFormatted(): String {
        return when {
            duration < 60 -> "${duration}s"
            duration < 3600 -> "${duration / 60}m ${duration % 60}s"
            else -> "${duration / 3600}h ${(duration % 3600) / 60}m"
        }
    }
    
    /**
     * Verifica se é uma chamada suspeita
     */
    fun isSuspicious(): Boolean {
        return riskScore >= 50 || 
               isEmergency || 
               (duration > 3600) || // Mais de 1 hora
               (contactName == null && !phoneNumber.matches("\\+?\\d{8,15}".toRegex())) ||
               isBlocked
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
     * Converte para Map para envio à API
     */
    fun toApiMap(): Map<String, Any?> {
        return mapOf(
            "id" to id,
            "phoneNumber" to phoneNumber,
            "contactName" to contactName,
            "callType" to callType.name,
            "duration" to duration,
            "timestamp" to timestamp,
            "isBlocked" to isBlocked,
            "location" to location?.toApiMap(),
            "appSource" to appSource,
            "isEmergency" to isEmergency,
            "riskScore" to riskScore,
            "metadata" to mapOf(
                "callerId" to metadata.callerId,
                "networkType" to metadata.networkType,
                "networkOperator" to metadata.networkOperator,
                "batteryLevel" to metadata.batteryLevel,
                "isRoaming" to metadata.isRoaming,
                "callQuality" to metadata.callQuality,
                "endReason" to metadata.endReason,
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
        callType: CallType? = null,
        duration: Long? = null,
        timestamp: Long? = null,
        isBlocked: Boolean? = null,
        location: LocationData? = null,
        appSource: String? = null,
        isEmergency: Boolean? = null,
        riskScore: Int? = null,
        metadata: CallMetadata? = null
    ): CallData {
        return copy(
            phoneNumber = phoneNumber ?: this.phoneNumber,
            contactName = contactName ?: this.contactName,
            callType = callType ?: this.callType,
            duration = duration ?: this.duration,
            timestamp = timestamp ?: this.timestamp,
            isBlocked = isBlocked ?: this.isBlocked,
            location = location ?: this.location,
            appSource = appSource ?: this.appSource,
            isEmergency = isEmergency ?: this.isEmergency,
            riskScore = riskScore ?: this.riskScore,
            metadata = metadata ?: this.metadata
        )
    }
    
    companion object {
        /**
         * Cria CallData a partir de Map da API
         */
        fun fromApiMap(map: Map<String, Any?>): CallData {
            val metadataMap = map["metadata"] as? Map<String, Any?> ?: emptyMap()
            val locationMap = map["location"] as? Map<String, Any?>
            
            return CallData(
                id = map["id"] as? String ?: UUID.randomUUID().toString(),
                phoneNumber = map["phoneNumber"] as? String ?: "",
                contactName = map["contactName"] as? String,
                callType = CallType.valueOf(map["callType"] as? String ?: "UNKNOWN"),
                duration = (map["duration"] as? Number)?.toLong() ?: 0L,
                timestamp = (map["timestamp"] as? Number)?.toLong() ?: System.currentTimeMillis(),
                isBlocked = map["isBlocked"] as? Boolean ?: false,
                location = locationMap?.let { LocationData.fromApiMap(it) },
                appSource = map["appSource"] as? String ?: "PHONE",
                isEmergency = map["isEmergency"] as? Boolean ?: false,
                riskScore = (map["riskScore"] as? Number)?.toInt() ?: 0,
                metadata = CallMetadata(
                    callerId = metadataMap["callerId"] as? String,
                    networkType = metadataMap["networkType"] as? String,
                    networkOperator = metadataMap["networkOperator"] as? String,
                    batteryLevel = (metadataMap["batteryLevel"] as? Number)?.toInt(),
                    isRoaming = metadataMap["isRoaming"] as? Boolean ?: false,
                    callQuality = metadataMap["callQuality"] as? String,
                    endReason = metadataMap["endReason"] as? String,
                    deviceModel = metadataMap["deviceModel"] as? String,
                    osVersion = metadataMap["osVersion"] as? String,
                    appVersion = metadataMap["appVersion"] as? String
                )
            )
        }
        
        /**
         * Cria CallData vazio para testes
         */
        fun empty(): CallData {
            return CallData(
                phoneNumber = "",
                callType = CallType.UNKNOWN,
                duration = 0,
                timestamp = System.currentTimeMillis()
            )
        }
        
        /**
         * Valida se os dados estão consistentes
         */
        fun isValid(callData: CallData): Boolean {
            return callData.phoneNumber.isNotEmpty() &&
                   callData.duration >= 0 &&
                   callData.timestamp > 0 &&
                   callData.riskScore in 0..100
        }
    }
}