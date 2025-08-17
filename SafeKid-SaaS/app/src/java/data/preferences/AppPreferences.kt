package com.safekid.monitor.data.preferences

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import timber.log.Timber

class AppPreferences(private val context: Context) {

    companion object {
        private const val PREF_NAME = "safekid_preferences"
        private const val ENCRYPTED_PREF_NAME = "safekid_secure_preferences"
        
        // Chaves de preferências
        private const val KEY_FIRST_RUN = "first_run"
        private const val KEY_APP_CONFIGURED = "app_configured"
        private const val KEY_APP_HIDDEN = "app_hidden"
        private const val KEY_MONITORING_ENABLED = "monitoring_enabled"
        private const val KEY_DEVICE_UUID = "device_uuid"
        private const val KEY_DEVICE_SECRET = "device_secret"
        private const val KEY_CHILD_ID = "child_id"
        private const val KEY_USER_ID = "user_id"
        private const val KEY_LAST_HEARTBEAT = "last_heartbeat"
        private const val KEY_LAST_SYNC = "last_sync"
        private const val KEY_API_BASE_URL = "api_base_url"
        private const val KEY_SYNC_WIFI_ONLY = "sync_wifi_only"
        private const val KEY_LOCATION_INTERVAL = "location_interval"
        private const val KEY_MAX_FILE_SIZE = "max_file_size"
        private const val KEY_AUTO_UPLOAD_MEDIA = "auto_upload_media"
        private const val KEY_COMPRESS_MEDIA = "compress_media"
        private const val KEY_DELETE_AFTER_UPLOAD = "delete_after_upload"
        private const val KEY_MONITORING_FEATURES = "monitoring_features"
        private const val KEY_DEBUG_MODE = "debug_mode"
        private const val KEY_LAST_ERROR = "last_error"
        private const val KEY_ERROR_COUNT = "error_count"
    }

    private val regularPrefs: SharedPreferences by lazy {
        context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
    }

    private val securePrefs: SharedPreferences by lazy {
        try {
            val masterKeyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
            
            EncryptedSharedPreferences.create(
                ENCRYPTED_PREF_NAME,
                masterKeyAlias,
                context,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (e: Exception) {
            Timber.e(e, "Erro ao criar preferências criptografadas, usando normais")
            context.getSharedPreferences("${ENCRYPTED_PREF_NAME}_fallback", Context.MODE_PRIVATE)
        }
    }

    // === CONFIGURAÇÃO INICIAL ===

    fun isFirstRun(): Boolean = regularPrefs.getBoolean(KEY_FIRST_RUN, true)

    fun setFirstRun(isFirstRun: Boolean) {
        regularPrefs.edit().putBoolean(KEY_FIRST_RUN, isFirstRun).apply()
    }

    fun isAppConfigured(): Boolean = regularPrefs.getBoolean(KEY_APP_CONFIGURED, false)

    fun setAppConfigured(configured: Boolean) {
        regularPrefs.edit().putBoolean(KEY_APP_CONFIGURED, configured).apply()
    }

    fun isAppHidden(): Boolean = regularPrefs.getBoolean(KEY_APP_HIDDEN, false)

    fun setAppHidden(hidden: Boolean) {
        regularPrefs.edit().putBoolean(KEY_APP_HIDDEN, hidden).apply()
    }

    // === MONITORAMENTO ===

    fun isMonitoringEnabled(): Boolean = regularPrefs.getBoolean(KEY_MONITORING_ENABLED, false)

    fun setMonitoringEnabled(enabled: Boolean) {
        regularPrefs.edit().putBoolean(KEY_MONITORING_ENABLED, enabled).apply()
    }

    // === IDENTIFICAÇÃO DO DISPOSITIVO ===

    fun getDeviceUuid(): String = securePrefs.getString(KEY_DEVICE_UUID, "") ?: ""

    fun setDeviceUuid(uuid: String) {
        securePrefs.edit().putString(KEY_DEVICE_UUID, uuid).apply()
    }

    fun getDeviceSecret(): String = securePrefs.getString(KEY_DEVICE_SECRET, "") ?: ""

    fun setDeviceSecret(secret: String) {
        securePrefs.edit().putString(KEY_DEVICE_SECRET, secret).apply()
    }

    // === VINCULAÇÃO COM SERVIDOR ===

    fun getChildId(): String = securePrefs.getString(KEY_CHILD_ID, "") ?: ""

    fun setChildId(childId: String) {
        securePrefs.edit().putString(KEY_CHILD_ID, childId).apply()
    }

    fun getUserId(): String = securePrefs.getString(KEY_USER_ID, "") ?: ""

    fun setUserId(userId: String) {
        securePrefs.edit().putString(KEY_USER_ID, userId).apply()
    }

    // === SINCRONIZAÇÃO ===

    fun getLastHeartbeat(): Long = regularPrefs.getLong(KEY_LAST_HEARTBEAT, 0)

    fun updateLastHeartbeat(timestamp: Long) {
        regularPrefs.edit().putLong(KEY_LAST_HEARTBEAT, timestamp).apply()
    }

    fun getLastSync(): Long = regularPrefs.getLong(KEY_LAST_SYNC, 0)

    fun updateLastSync(timestamp: Long) {
        regularPrefs.edit().putLong(KEY_LAST_SYNC, timestamp).apply()
    }

    // === CONFIGURAÇÕES DE REDE ===

    fun getApiBaseUrl(): String = regularPrefs.getString(KEY_API_BASE_URL, 
        com.safekid.monitor.BuildConfig.API_BASE_URL) ?: com.safekid.monitor.BuildConfig.API_BASE_URL

    fun setApiBaseUrl(url: String) {
        regularPrefs.edit().putString(KEY_API_BASE_URL, url).apply()
    }

    fun isSyncWifiOnly(): Boolean = regularPrefs.getBoolean(KEY_SYNC_WIFI_ONLY, true)

    fun setSyncWifiOnly(wifiOnly: Boolean) {
        regularPrefs.edit().putBoolean(KEY_SYNC_WIFI_ONLY, wifiOnly).apply()
    }

    // === CONFIGURAÇÕES DE LOCALIZAÇÃO ===

    fun getLocationInterval(): Long = regularPrefs.getLong(KEY_LOCATION_INTERVAL, 30000) // 30 segundos padrão

    fun setLocationInterval(intervalMs: Long) {
        regularPrefs.edit().putLong(KEY_LOCATION_INTERVAL, intervalMs).apply()
    }

    // === CONFIGURAÇÕES DE MÍDIA ===

    fun getMaxFileSize(): Long = regularPrefs.getLong(KEY_MAX_FILE_SIZE, 10 * 1024 * 1024) // 10MB padrão

    fun setMaxFileSize(sizeBytes: Long) {
        regularPrefs.edit().putLong(KEY_MAX_FILE_SIZE, sizeBytes).apply()
    }

    fun isAutoUploadMediaEnabled(): Boolean = regularPrefs.getBoolean(KEY_AUTO_UPLOAD_MEDIA, true)

    fun setAutoUploadMedia(enabled: Boolean) {
        regularPrefs.edit().putBoolean(KEY_AUTO_UPLOAD_MEDIA, enabled).apply()
    }

    fun isCompressMediaEnabled(): Boolean = regularPrefs.getBoolean(KEY_COMPRESS_MEDIA, true)

    fun setCompressMedia(enabled: Boolean) {
        regularPrefs.edit().putBoolean(KEY_COMPRESS_MEDIA, enabled).apply()
    }

    fun isDeleteAfterUploadEnabled(): Boolean = regularPrefs.getBoolean(KEY_DELETE_AFTER_UPLOAD, false)

    fun setDeleteAfterUpload(enabled: Boolean) {
        regularPrefs.edit().putBoolean(KEY_DELETE_AFTER_UPLOAD, enabled).apply()
    }

    // === FUNCIONALIDADES DE MONITORAMENTO ===

    fun getMonitoringFeatures(): Set<String> = regularPrefs.getStringSet(KEY_MONITORING_FEATURES, 
        setOf("location", "calls", "messages", "media", "apps")) ?: setOf()

    fun setMonitoringFeatures(features: Set<String>) {
        regularPrefs.edit().putStringSet(KEY_MONITORING_FEATURES, features).apply()
    }

    fun isFeatureEnabled(feature: String): Boolean = getMonitoringFeatures().contains(feature)

    fun enableFeature(feature: String) {
        val currentFeatures = getMonitoringFeatures().toMutableSet()
        currentFeatures.add(feature)
        setMonitoringFeatures(currentFeatures)
    }

    fun disableFeature(feature: String) {
        val currentFeatures = getMonitoringFeatures().toMutableSet()
        currentFeatures.remove(feature)
        setMonitoringFeatures(currentFeatures)
    }

    // === DEBUG E LOGS ===

    fun isDebugMode(): Boolean = regularPrefs.getBoolean(KEY_DEBUG_MODE, 
        com.safekid.monitor.BuildConfig.DEBUG_MODE)

    fun setDebugMode(enabled: Boolean) {
        regularPrefs.edit().putBoolean(KEY_DEBUG_MODE, enabled).apply()
    }

    // === TRATAMENTO DE ERROS ===

    fun getLastError(): String = regularPrefs.getString(KEY_LAST_ERROR, "") ?: ""

    fun setLastError(error: String) {
        regularPrefs.edit()
            .putString(KEY_LAST_ERROR, error)
            .putLong("${KEY_LAST_ERROR}_timestamp", System.currentTimeMillis())
            .apply()
    }

    fun getErrorCount(): Int = regularPrefs.getInt(KEY_ERROR_COUNT, 0)

    fun incrementErrorCount() {
        val currentCount = getErrorCount()
        regularPrefs.edit().putInt(KEY_ERROR_COUNT, currentCount + 1).apply()
    }

    fun resetErrorCount() {
        regularPrefs.edit().putInt(KEY_ERROR_COUNT, 0).apply()
    }

    // === CONFIGURAÇÕES AVANÇADAS ===

    fun getCustomSetting(key: String, defaultValue: String = ""): String {
        return regularPrefs.getString("custom_$key", defaultValue) ?: defaultValue
    }

    fun setCustomSetting(key: String, value: String) {
        regularPrefs.edit().putString("custom_$key", value).apply()
    }

    fun getCustomBooleanSetting(key: String, defaultValue: Boolean = false): Boolean {
        return regularPrefs.getBoolean("custom_$key", defaultValue)
    }

    fun setCustomBooleanSetting(key: String, value: Boolean) {
        regularPrefs.edit().putBoolean("custom_$key", value).apply()
    }

    fun getCustomIntSetting(key: String, defaultValue: Int = 0): Int {
        return regularPrefs.getInt("custom_$key", defaultValue)
    }

    fun setCustomIntSetting(key: String, value: Int) {
        regularPrefs.edit().putInt("custom_$key", value).apply()
    }

    // === CONFIGURAÇÕES DO SERVIDOR ===

    fun applyServerConfig(config: Map<String, Any>) {
        val editor = regularPrefs.edit()
        
        config.forEach { (key, value) ->
            when (value) {
                is String -> editor.putString("server_$key", value)
                is Boolean -> editor.putBoolean("server_$key", value)
                is Int -> editor.putInt("server_$key", value)
                is Long -> editor.putLong("server_$key", value)
                is Float -> editor.putFloat("server_$key", value)
            }
        }
        
        editor.apply()
        Timber.d("Configurações do servidor aplicadas: ${config.keys}")
    }

    fun getServerConfig(key: String, defaultValue: Any): Any {
        return when (defaultValue) {
            is String -> regularPrefs.getString("server_$key", defaultValue) ?: defaultValue
            is Boolean -> regularPrefs.getBoolean("server_$key", defaultValue)
            is Int -> regularPrefs.getInt("server_$key", defaultValue)
            is Long -> regularPrefs.getLong("server_$key", defaultValue)
            is Float -> regularPrefs.getFloat("server_$key", defaultValue)
            else -> defaultValue
        }
    }

    // === ESTATÍSTICAS ===

    fun getDataUsage(): Map<String, Long> {
        return mapOf(
            "total_uploaded" to regularPrefs.getLong("stats_total_uploaded", 0),
            "total_downloaded" to regularPrefs.getLong("stats_total_downloaded", 0),
            "locations_sent" to regularPrefs.getLong("stats_locations_sent", 0),
            "messages_sent" to regularPrefs.getLong("stats_messages_sent", 0),
            "calls_sent" to regularPrefs.getLong("stats_calls_sent", 0),
            "media_sent" to regularPrefs.getLong("stats_media_sent", 0)
        )
    }

    fun incrementDataUsage(type: String, bytes: Long) {
        val currentValue = regularPrefs.getLong("stats_$type", 0)
        regularPrefs.edit().putLong("stats_$type", currentValue + bytes).apply()
    }

    fun resetStatistics() {
        val editor = regularPrefs.edit()
        getDataUsage().keys.forEach { key ->
            editor.remove("stats_$key")
        }
        editor.apply()
    }

    // === LIMPEZA ===

    fun clear() {
        try {
            regularPrefs.edit().clear().apply()
            securePrefs.edit().clear().apply()
            Timber.d("Preferências limpas")
        } catch (e: Exception) {
            Timber.e(e, "Erro ao limpar preferências")
        }
    }

    fun clearSecureData() {
        try {
            securePrefs.edit().clear().apply()
            Timber.d("Dados seguros limpos")
        } catch (e: Exception) {
            Timber.e(e, "Erro ao limpar dados seguros")
        }
    }

    // === EXPORTAR/IMPORTAR CONFIGURAÇÕES ===

    fun exportSettings(): Map<String, Any> {
        val settings = mutableMapOf<String, Any>()
        
        regularPrefs.all.forEach { (key, value) ->
            if (!key.startsWith("stats_") && !key.contains("secret") && !key.contains("uuid")) {
                value?.let { settings[key] = it }
            }
        }
        
        return settings
    }

    fun importSettings(settings: Map<String, Any>) {
        val editor = regularPrefs.edit()
        
        settings.forEach { (key, value) ->
            when (value) {
                is String -> editor.putString(key, value)
                is Boolean -> editor.putBoolean(key, value)
                is Int -> editor.putInt(key, value)
                is Long -> editor.putLong(key, value)
                is Float -> editor.putFloat(key, value)
                is Set<*> -> editor.putStringSet(key, value as Set<String>)
            }
        }
        
        editor.apply()
        Timber.d("Configurações importadas: ${settings.keys}")
    }

    // === VALIDAÇÃO ===

    fun validateConfiguration(): Boolean {
        return try {
            getDeviceUuid().isNotEmpty() &&
            getDeviceSecret().isNotEmpty() &&
            isAppConfigured()
        } catch (e: Exception) {
            Timber.e(e, "Erro na validação da configuração")
            false
        }
    }

    // === INFORMAÇÕES DE STATUS ===

    fun getStatusInfo(): Map<String, Any> {
        return mapOf(
            "app_configured" to isAppConfigured(),
            "monitoring_enabled" to isMonitoringEnabled(),
            "app_hidden" to isAppHidden(),
            "last_heartbeat" to getLastHeartbeat(),
            "last_sync" to getLastSync(),
            "error_count" to getErrorCount(),
            "features_enabled" to getMonitoringFeatures().size,
            "sync_wifi_only" to isSyncWifiOnly(),
            "debug_mode" to isDebugMode()
        )
    }
}