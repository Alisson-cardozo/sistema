package com.safekid.monitor

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.room.Room
import androidx.work.Configuration
import androidx.work.WorkManager
import com.safekid.monitor.data.database.SafeKidDatabase
import com.safekid.monitor.data.preferences.AppPreferences
import com.safekid.monitor.di.appModule
import com.safekid.monitor.services.MonitoringService
import com.safekid.monitor.utils.CryptoUtils
import com.safekid.monitor.utils.DeviceUtils
import org.koin.android.ext.koin.androidContext
import org.koin.core.context.startKoin
import timber.log.Timber

class SafeKidApplication : Application(), Configuration.Provider {

    companion object {
        const val NOTIFICATION_CHANNEL_ID = "safekid_monitoring"
        const val NOTIFICATION_CHANNEL_NAME = "SafeKid Monitoring"
        
        lateinit var instance: SafeKidApplication
            private set
    }

    lateinit var database: SafeKidDatabase
        private set
        
    lateinit var preferences: AppPreferences
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this

        // Configurar logs
        setupLogging()

        // Inicializar banco de dados
        initDatabase()

        // Inicializar preferências
        preferences = AppPreferences(this)

        // Configurar injeção de dependência
        setupDependencyInjection()

        // Criar canais de notificação
        createNotificationChannels()

        // Inicializar criptografia
        initCrypto()

        // Verificar se é a primeira execução
        handleFirstRun()

        // Iniciar serviços se já configurado
        if (preferences.isAppConfigured()) {
            startMonitoringServices()
        }

        Timber.d("SafeKid Application iniciada")
    }

    private fun setupLogging() {
        if (BuildConfig.DEBUG_MODE) {
            Timber.plant(Timber.DebugTree())
        } else {
            // Em produção, usar apenas logs essenciais
            Timber.plant(object : Timber.Tree() {
                override fun log(priority: Int, tag: String?, message: String, t: Throwable?) {
                    // Log apenas erros e warnings em produção
                    if (priority >= android.util.Log.WARN) {
                        // Aqui você pode implementar logging remoto
                        // Por exemplo, Firebase Crashlytics
                    }
                }
            })
        }
    }

    private fun initDatabase() {
        database = Room.databaseBuilder(
            applicationContext,
            SafeKidDatabase::class.java,
            "safekid_database"
        )
            .fallbackToDestructiveMigration()
            .build()
    }

    private fun setupDependencyInjection() {
        startKoin {
            androidContext(this@SafeKidApplication)
            modules(appModule)
        }
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            // Canal principal para serviço em foreground
            val mainChannel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                NOTIFICATION_CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Canal para serviços de monitoramento SafeKid"
                setSound(null, null)
                enableVibration(false)
                enableLights(false)
                setShowBadge(false)
            }

            notificationManager.createNotificationChannel(mainChannel)
        }
    }

    private fun initCrypto() {
        try {
            CryptoUtils.initialize(this)
            Timber.d("Criptografia inicializada com sucesso")
        } catch (e: Exception) {
            Timber.e(e, "Erro ao inicializar criptografia")
        }
    }

    private fun handleFirstRun() {
        if (preferences.isFirstRun()) {
            Timber.d("Primeira execução detectada")
            
            // Gerar UUID único do dispositivo
            val deviceUuid = DeviceUtils.generateDeviceUUID(this)
            preferences.setDeviceUuid(deviceUuid)
            
            // Gerar chaves de criptografia
            val deviceSecret = CryptoUtils.generateDeviceSecret()
            preferences.setDeviceSecret(deviceSecret)
            
            // Marcar como não sendo mais primeira execução
            preferences.setFirstRun(false)
            
            Timber.d("Configuração inicial concluída")
        }
    }

    private fun startMonitoringServices() {
        try {
            // Iniciar serviço principal de monitoramento
            MonitoringService.start(this)
            
            Timber.d("Serviços de monitoramento iniciados")
        } catch (e: Exception) {
            Timber.e(e, "Erro ao iniciar serviços de monitoramento")
        }
    }

    fun hideAppIcon() {
        try {
            // Ocultar ícone do launcher após configuração
            val packageManager = packageManager
            val componentName = android.content.ComponentName(
                this,
                "com.safekid.monitor.SetupActivity"
            )
            
            packageManager.setComponentEnabledSetting(
                componentName,
                android.content.pm.PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                android.content.pm.PackageManager.DONT_KILL_APP
            )
            
            preferences.setAppHidden(true)
            Timber.d("Ícone do app ocultado")
        } catch (e: Exception) {
            Timber.e(e, "Erro ao ocultar ícone do app")
        }
    }

    fun isAppHidden(): Boolean {
        return preferences.isAppHidden()
    }

    // Configuração do WorkManager
    override fun getWorkManagerConfiguration(): Configuration {
        return Configuration.Builder()
            .setMinimumLoggingLevel(if (BuildConfig.DEBUG_MODE) android.util.Log.DEBUG else android.util.Log.ERROR)
            .build()
    }

    // Métodos para gerenciar estado da aplicação
    fun setAppConfigured(configured: Boolean) {
        preferences.setAppConfigured(configured)
        if (configured) {
            startMonitoringServices()
        }
    }

    fun isAppConfigured(): Boolean {
        return preferences.isAppConfigured()
    }

    // Limpar dados da aplicação (para desinstalação limpa)
    fun clearAppData() {
        try {
            // Parar todos os serviços
            MonitoringService.stop(this)
            
            // Limpar banco de dados
            database.clearAllTables()
            
            // Limpar preferências
            preferences.clear()
            
            // Reabilitar ícone do app se necessário
            val packageManager = packageManager
            val componentName = android.content.ComponentName(
                this,
                "com.safekid.monitor.SetupActivity"
            )
            
            packageManager.setComponentEnabledSetting(
                componentName,
                android.content.pm.PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                android.content.pm.PackageManager.DONT_KILL_APP
            )
            
            Timber.d("Dados da aplicação limpos")
        } catch (e: Exception) {
            Timber.e(e, "Erro ao limpar dados da aplicação")
        }
    }

    // Obter informações do dispositivo
    fun getDeviceInfo(): Map<String, String> {
        return mapOf(
            "uuid" to preferences.getDeviceUuid(),
            "model" to DeviceUtils.getDeviceModel(),
            "android_version" to DeviceUtils.getAndroidVersion(),
            "app_version" to BuildConfig.VERSION_NAME,
            "manufacturer" to DeviceUtils.getManufacturer()
        )
    }
}