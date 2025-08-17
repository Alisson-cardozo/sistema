package com.safekid.monitor.data.api

import retrofit2.Response
import retrofit2.http.*

interface ApiService {

    // === DISPOSITIVOS ===
    
    @POST("devices/register")
    suspend fun registerDevice(
        @Header("X-Device-UUID") deviceUuid: String,
        @Header("X-Device-Secret") deviceSecret: String,
        @Body deviceInfo: Map<String, Any>
    ): Response<DeviceRegistrationResponse>

    @POST("devices/{deviceId}/heartbeat")
    suspend fun sendHeartbeat(
        @Path("deviceId") deviceId: String,
        @Header("X-Device-UUID") deviceUuid: String,
        @Header("X-Device-Secret") deviceSecret: String,
        @Body data: Map<String, Any>
    ): Response<HeartbeatResponse>

    // === LOCALIZAÇÃO ===
    
    @POST("locations")
    suspend fun sendLocation(
        @Header("X-Device-UUID") deviceUuid: String,
        @Header("X-Device-Secret") deviceSecret: String,
        @Body locationData: Map<String, Any>
    ): Response<LocationResponse>

    @POST("locations/bulk")
    suspend fun sendLocationsBatch(
        @Header("X-Device-UUID") deviceUuid: String,
        @Header("X-Device-Secret") deviceSecret: String,
        @Body locations: List<Map<String, Any>>
    ): Response<BatchResponse>

    // === MENSAGENS ===
    
    @POST("messages")
    suspend fun sendMessage(
        @Header("X-Device-UUID") deviceUuid: String,
        @Header("X-Device-Secret") deviceSecret: String,
        @Body messageData: Map<String, Any>
    ): Response<MessageResponse>

    @POST("messages/bulk")
    suspend fun sendMessagesBatch(
        @Header("X-Device-UUID") deviceUuid: String,
        @Header("X-Device-Secret") deviceSecret: String,
        @Body messages: List<Map<String, Any>>
    ): Response<BatchResponse>

    // === CHAMADAS ===
    
    @POST("calls")
    suspend fun sendCall(
        @Header("X-Device-UUID") deviceUuid: String,
        @Header("X-Device-Secret") deviceSecret: String,
        @Body callData: Map<String, Any>
    ): Response<CallResponse>

    @POST("calls/bulk")
    suspend fun sendCallsBatch(
        @Header("X-Device-UUID") deviceUuid: String,
        @Header("X-Device-Secret") deviceSecret: String,
        @Body calls: List<Map<String, Any>>
    ): Response<BatchResponse>

    // === MÍDIA ===
    
    @Multipart
    @POST("media/upload")
    suspend fun uploadMedia(
        @Header("X-Device-UUID") deviceUuid: String,
        @Header("X-Device-Secret") deviceSecret: String,
        @Part file: okhttp3.MultipartBody.Part,
        @Part("origem") origem: okhttp3.RequestBody,
        @Part("tipo") tipo: okhttp3.RequestBody,
        @Part("data_criacao") dataCriacao: okhttp3.RequestBody
    ): Response<MediaResponse>

    @POST("media")
    suspend fun sendMediaInfo(
        @Header("X-Device-UUID") deviceUuid: String,
        @Header("X-Device-Secret") deviceSecret: String,
        @Body mediaData: Map<String, Any>
    ): Response<MediaResponse>

    // === APLICATIVOS ===
    
    @POST("apps/installed")
    suspend fun sendInstalledApps(
        @Header("X-Device-UUID") deviceUuid: String,
        @Header("X-Device-Secret") deviceSecret: String,
        @Body appsData: List<Map<String, Any>>
    ): Response<AppsResponse>

    @POST("apps/usage")
    suspend fun sendAppUsage(
        @Header("X-Device-UUID") deviceUuid: String,
        @Header("X-Device-Secret") deviceSecret: String,
        @Body usageData: List<Map<String, Any>>
    ): Response<AppsResponse>

    // === COMANDOS DO SERVIDOR ===
    
    @GET("devices/{deviceId}/commands")
    suspend fun getCommands(
        @Path("deviceId") deviceId: String,
        @Header("X-Device-UUID") deviceUuid: String,
        @Header("X-Device-Secret") deviceSecret: String
    ): Response<CommandsResponse>

    @POST("devices/{deviceId}/commands/{commandId}/response")
    suspend fun sendCommandResponse(
        @Path("deviceId") deviceId: String,
        @Path("commandId") commandId: String,
        @Header("X-Device-UUID") deviceUuid: String,
        @Header("X-Device-Secret") deviceSecret: String,
        @Body response: Map<String, Any>
    ): Response<CommandResponseAck>

    // === CONFIGURAÇÕES ===
    
    @GET("devices/{deviceId}/config")
    suspend fun getDeviceConfig(
        @Path("deviceId") deviceId: String,
        @Header("X-Device-UUID") deviceUuid: String,
        @Header("X-Device-Secret") deviceSecret: String
    ): Response<DeviceConfigResponse>

    @POST("devices/{deviceId}/status")
    suspend fun updateDeviceStatus(
        @Path("deviceId") deviceId: String,
        @Header("X-Device-UUID") deviceUuid: String,
        @Header("X-Device-Secret") deviceSecret: String,
        @Body status: Map<String, Any>
    ): Response<StatusResponse>
}

// === DATA CLASSES PARA RESPONSES ===

data class DeviceRegistrationResponse(
    val success: Boolean,
    val message: String,
    val deviceId: String,
    val childId: String?
)

data class HeartbeatResponse(
    val success: Boolean,
    val message: String,
    val timestamp: Long,
    val commands: List<ServerCommand>? = null
)

data class LocationResponse(
    val success: Boolean,
    val message: String,
    val locationId: String
)

data class MessageResponse(
    val success: Boolean,
    val message: String,
    val messageId: String
)

data class CallResponse(
    val success: Boolean,
    val message: String,
    val callId: String
)

data class MediaResponse(
    val success: Boolean,
    val message: String,
    val mediaId: String,
    val uploadUrl: String? = null
)

data class AppsResponse(
    val success: Boolean,
    val message: String,
    val processed: Int
)

data class BatchResponse(
    val success: Boolean,
    val message: String,
    val totalProcessed: Int,
    val errors: List<String>? = null
)

data class CommandsResponse(
    val success: Boolean,
    val commands: List<ServerCommand>
)

data class CommandResponseAck(
    val success: Boolean,
    val message: String
)

data class DeviceConfigResponse(
    val success: Boolean,
    val config: DeviceConfig
)

data class StatusResponse(
    val success: Boolean,
    val message: String
)

// === DATA CLASSES PARA COMANDOS E CONFIGURAÇÕES ===

data class ServerCommand(
    val id: String,
    val type: String,
    val action: String,
    val parameters: Map<String, Any>? = null,
    val timestamp: Long
)

data class DeviceConfig(
    val monitoringEnabled: Boolean,
    val locationInterval: Long,
    val uploadWifiOnly: Boolean,
    val maxFileSize: Long,
    val syncInterval: Long,
    val features: Map<String, Boolean>
)

// === IMPLEMENTAÇÃO DO INTERCEPTOR DE AUTENTICAÇÃO ===

import okhttp3.Interceptor
import okhttp3.Response
import com.safekid.monitor.data.preferences.AppPreferences
import com.safekid.monitor.utils.CryptoUtils

class AuthInterceptor(
    private val preferences: AppPreferences
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()
        
        // Adicionar headers de autenticação se não estiverem presentes
        val requestBuilder = originalRequest.newBuilder()

        if (originalRequest.header("X-Device-UUID") == null) {
            requestBuilder.addHeader("X-Device-UUID", preferences.getDeviceUuid())
        }

        if (originalRequest.header("X-Device-Secret") == null) {
            val deviceSecret = generateDeviceSecret()
            requestBuilder.addHeader("X-Device-Secret", deviceSecret)
        }

        // Adicionar headers padrão
        requestBuilder.addHeader("User-Agent", "SafeKid-Android/${com.safekid.monitor.BuildConfig.VERSION_NAME}")
        requestBuilder.addHeader("Accept", "application/json")
        requestBuilder.addHeader("Content-Type", "application/json")

        return chain.proceed(requestBuilder.build())
    }

    private fun generateDeviceSecret(): String {
        val deviceUuid = preferences.getDeviceUuid()
        val timestamp = System.currentTimeMillis()
        val data = "$deviceUuid:$timestamp"
        
        return CryptoUtils.createHMAC(data, preferences.getDeviceSecret())
    }
}

// === FACTORY PARA CRIAÇÃO DO RETROFIT ===

import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import com.google.gson.GsonBuilder
import java.util.concurrent.TimeUnit

object ApiServiceFactory {

    fun create(preferences: AppPreferences): ApiService {
        val loggingInterceptor = HttpLoggingInterceptor().apply {
            level = if (com.safekid.monitor.BuildConfig.DEBUG_MODE) {
                HttpLoggingInterceptor.Level.BODY
            } else {
                HttpLoggingInterceptor.Level.NONE
            }
        }

        val okHttpClient = OkHttpClient.Builder()
            .addInterceptor(AuthInterceptor(preferences))
            .addInterceptor(loggingInterceptor)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()

        val gson = GsonBuilder()
            .setDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
            .create()

        val retrofit = Retrofit.Builder()
            .baseUrl(com.safekid.monitor.BuildConfig.API_BASE_URL)
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create(gson))
            .build()

        return retrofit.create(ApiService::class.java)
    }
}

// === WRAPPER PARA FACILITAR CHAMADAS ===

class ApiClient(private val apiService: ApiService, private val preferences: AppPreferences) {

    suspend fun registerDevice(deviceInfo: Map<String, Any>): Response<DeviceRegistrationResponse> {
        return apiService.registerDevice(
            deviceUuid = preferences.getDeviceUuid(),
            deviceSecret = generateSecret(),
            deviceInfo = deviceInfo
        )
    }

    suspend fun sendHeartbeat(data: Map<String, Any>): Response<HeartbeatResponse> {
        return apiService.sendHeartbeat(
            deviceId = preferences.getDeviceUuid(),
            deviceUuid = preferences.getDeviceUuid(),
            deviceSecret = generateSecret(),
            data = data
        )
    }

    suspend fun sendLocation(locationData: Map<String, Any>): Response<LocationResponse> {
        return apiService.sendLocation(
            deviceUuid = preferences.getDeviceUuid(),
            deviceSecret = generateSecret(),
            locationData = locationData
        )
    }

    suspend fun sendLocationsBatch(locations: List<Map<String, Any>>): Response<BatchResponse> {
        return apiService.sendLocationsBatch(
            deviceUuid = preferences.getDeviceUuid(),
            deviceSecret = generateSecret(),
            locations = locations
        )
    }

    suspend fun sendMessage(messageData: Map<String, Any>): Response<MessageResponse> {
        return apiService.sendMessage(
            deviceUuid = preferences.getDeviceUuid(),
            deviceSecret = generateSecret(),
            messageData = messageData
        )
    }

    suspend fun sendMessagesBatch(messages: List<Map<String, Any>>): Response<BatchResponse> {
        return apiService.sendMessagesBatch(
            deviceUuid = preferences.getDeviceUuid(),
            deviceSecret = generateSecret(),
            messages = messages
        )
    }

    private fun generateSecret(): String {
        val deviceUuid = preferences.getDeviceUuid()
        val timestamp = System.currentTimeMillis()
        val data = "$deviceUuid:$timestamp"
        
        return CryptoUtils.createHMAC(data, preferences.getDeviceSecret())
    }
}