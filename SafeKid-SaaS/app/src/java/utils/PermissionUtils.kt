package com.safekid.monitor.utils

import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.view.accessibility.AccessibilityManager
import androidx.core.app.NotificationManagerCompat
import timber.log.Timber

object PermissionUtils {

    /**
     * Verificar se o serviço de acessibilidade está habilitado
     */
    fun isAccessibilityServiceEnabled(context: Context): Boolean {
        return try {
            val accessibilityManager = context.getSystemService(Context.ACCESSIBILITY_SERVICE) as AccessibilityManager
            val enabledServices = accessibilityManager.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)
            
            val serviceComponentName = "${context.packageName}/${context.packageName}.services.AccessibilityService"
            
            enabledServices.any { 
                it.resolveInfo.serviceInfo.name == serviceComponentName ||
                it.id.contains(context.packageName)
            }
        } catch (e: Exception) {
            Timber.e(e, "Erro ao verificar serviço de acessibilidade")
            false
        }
    }

    /**
     * Verificar se o listener de notificações está habilitado
     */
    fun isNotificationListenerEnabled(context: Context): Boolean {
        return try {
            val enabledListeners = Settings.Secure.getString(
                context.contentResolver,
                "enabled_notification_listeners"
            )
            
            enabledListeners?.contains(context.packageName) == true
        } catch (e: Exception) {
            Timber.e(e, "Erro ao verificar listener de notificações")
            false
        }
    }

    /**
     * Verificar se a otimização de bateria está desabilitada para o app
     */
    fun isBatteryOptimizationDisabled(context: Context): Boolean {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
                powerManager.isIgnoringBatteryOptimizations(context.packageName)
            } else {
                true // Versões antigas não têm otimização de bateria
            }
        } catch (e: Exception) {
            Timber.e(e, "Erro ao verificar otimização de bateria")
            false
        }
    }

    /**
     * Verificar se o app tem permissão de administrador
     */
    fun isDeviceAdminEnabled(context: Context): Boolean {
        return try {
            // TODO: Implementar verificação de device admin se necessário
            // Por enquanto retorna false pois não é essencial
            false
        } catch (e: Exception) {
            Timber.e(e, "Erro ao verificar device admin")
            false
        }
    }

    /**
     * Verificar se tem permissão para sobrepor outras janelas
     */
    fun canDrawOverlays(context: Context): Boolean {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Settings.canDrawOverlays(context)
            } else {
                true // Versões antigas têm permissão por padrão
            }
        } catch (e: Exception) {
            Timber.e(e, "Erro ao verificar permissão de sobreposição")
            false
        }
    }

    /**
     * Verificar se tem permissão de uso de dados/estatísticas
     */
    fun hasUsageStatsPermission(context: Context): Boolean {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                val appOpsManager = context.getSystemService(Context.APP_OPS_SERVICE) as android.app.AppOpsManager
                val mode = appOpsManager.checkOpNoThrow(
                    "android:get_usage_stats",
                    android.os.Process.myUid(),
                    context.packageName
                )
                mode == android.app.AppOpsManager.MODE_ALLOWED
            } else {
                true
            }
        } catch (e: Exception) {
            Timber.e(e, "Erro ao verificar permissão de estatísticas de uso")
            false
        }
    }

    /**
     * Abrir configurações de acessibilidade
     */
    fun openAccessibilitySettings(context: Context) {
        try {
            val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Timber.e(e, "Erro ao abrir configurações de acessibilidade")
            openGeneralSettings(context)
        }
    }

    /**
     * Abrir configurações de listener de notificações
     */
    fun openNotificationListenerSettings(context: Context) {
        try {
            val intent = Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS").apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Timber.e(e, "Erro ao abrir configurações de notificações")
            openGeneralSettings(context)
        }
    }

    /**
     * Abrir configurações de otimização de bateria
     */
    fun openBatteryOptimizationSettings(context: Context) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:${context.packageName}")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                context.startActivity(intent)
            }
        } catch (e: Exception) {
            Timber.e(e, "Erro ao abrir configurações de bateria")
            try {
                // Fallback para configurações gerais de bateria
                val intent = Intent(Settings.ACTION_BATTERY_SAVER_SETTINGS).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                context.startActivity(intent)
            } catch (e2: Exception) {
                openGeneralSettings(context)
            }
        }
    }

    /**
     * Abrir configurações de estatísticas de uso
     */
    fun openUsageStatsSettings(context: Context) {
        try {
            val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Timber.e(e, "Erro ao abrir configurações de estatísticas")
            openGeneralSettings(context)
        }
    }

    /**
     * Abrir configurações de sobreposição
     */
    fun openOverlaySettings(context: Context) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION).apply {
                    data = Uri.parse("package:${context.packageName}")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                context.startActivity(intent)
            }
        } catch (e: Exception) {
            Timber.e(e, "Erro ao abrir configurações de sobreposição")
            openGeneralSettings(context)
        }
    }

    /**
     * Abrir configurações gerais do aplicativo
     */
    fun openAppSettings(context: Context) {
        try {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:${context.packageName}")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Timber.e(e, "Erro ao abrir configurações do app")
            openGeneralSettings(context)
        }
    }

    /**
     * Abrir configurações gerais do sistema
     */
    private fun openGeneralSettings(context: Context) {
        try {
            val intent = Intent(Settings.ACTION_SETTINGS).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Timber.e(e, "Erro ao abrir configurações gerais")
        }
    }

    /**
     * Verificar todas as permissões especiais
     */
    fun checkAllSpecialPermissions(context: Context): PermissionStatus {
        return PermissionStatus(
            accessibilityService = isAccessibilityServiceEnabled(context),
            notificationListener = isNotificationListenerEnabled(context),
            batteryOptimization = isBatteryOptimizationDisabled(context),
            usageStats = hasUsageStatsPermission(context),
            drawOverlays = canDrawOverlays(context),
            deviceAdmin = isDeviceAdminEnabled(context)
        )
    }

    /**
     * Obter lista de permissões especiais pendentes
     */
    fun getPendingSpecialPermissions(context: Context): List<SpecialPermission> {
        val pending = mutableListOf<SpecialPermission>()

        if (!isAccessibilityServiceEnabled(context)) {
            pending.add(SpecialPermission.ACCESSIBILITY_SERVICE)
        }

        if (!isNotificationListenerEnabled(context)) {
            pending.add(SpecialPermission.NOTIFICATION_LISTENER)
        }

        if (!isBatteryOptimizationDisabled(context)) {
            pending.add(SpecialPermission.BATTERY_OPTIMIZATION)
        }

        if (!hasUsageStatsPermission(context)) {
            pending.add(SpecialPermission.USAGE_STATS)
        }

        if (!canDrawOverlays(context)) {
            pending.add(SpecialPermission.DRAW_OVERLAYS)
        }

        return pending
    }

    /**
     * Abrir configuração para uma permissão específica
     */
    fun openPermissionSettings(context: Context, permission: SpecialPermission) {
        when (permission) {
            SpecialPermission.ACCESSIBILITY_SERVICE -> openAccessibilitySettings(context)
            SpecialPermission.NOTIFICATION_LISTENER -> openNotificationListenerSettings(context)
            SpecialPermission.BATTERY_OPTIMIZATION -> openBatteryOptimizationSettings(context)
            SpecialPermission.USAGE_STATS -> openUsageStatsSettings(context)
            SpecialPermission.DRAW_OVERLAYS -> openOverlaySettings(context)
            SpecialPermission.DEVICE_ADMIN -> openAppSettings(context) // TODO: implementar device admin específico
        }
    }
}

/**
 * Data class para status de permissões
 */
data class PermissionStatus(
    val accessibilityService: Boolean,
    val notificationListener: Boolean,
    val batteryOptimization: Boolean,
    val usageStats: Boolean,
    val drawOverlays: Boolean,
    val deviceAdmin: Boolean
) {
    fun allGranted(): Boolean {
        return accessibilityService && notificationListener && batteryOptimization && 
               usageStats && drawOverlays
    }
    
    fun essentialGranted(): Boolean {
        // Permissões essenciais para funcionamento básico
        return accessibilityService || notificationListener
    }
}

/**
 * Enum para permissões especiais
 */
enum class SpecialPermission(val displayName: String, val description: String) {
    ACCESSIBILITY_SERVICE(
        "Serviço de Acessibilidade",
        "Necessário para monitorar WhatsApp e Telegram"
    ),
    NOTIFICATION_LISTENER(
        "Acesso a Notificações", 
        "Necessário para capturar mensagens de aplicativos"
    ),
    BATTERY_OPTIMIZATION(
        "Otimização de Bateria",
        "Necessário para funcionar em segundo plano"
    ),
    USAGE_STATS(
        "Estatísticas de Uso",
        "Necessário para monitorar uso de aplicativos"
    ),
    DRAW_OVERLAYS(
        "Sobreposição de Tela",
        "Necessário para algumas funcionalidades avançadas"
    ),
    DEVICE_ADMIN(
        "Administrador do Dispositivo",
        "Necessário para funcionalidades administrativas"
    )
}