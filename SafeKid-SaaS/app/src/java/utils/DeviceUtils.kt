package com.safekid.monitor.utils

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.Build
import android.provider.Settings
import android.telephony.TelephonyManager
import android.util.DisplayMetrics
import android.view.WindowManager
import timber.log.Timber
import java.io.File
import java.util.*

object DeviceUtils {

    /**
     * Gerar UUID único do dispositivo
     */
    @SuppressLint("HardwareIds")
    fun generateDeviceUUID(context: Context): String {
        return try {
            // Usar Android ID como base
            val androidId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
            
            // Combinar com outras informações do dispositivo
            val deviceInfo = "${androidId}_${Build.MODEL}_${Build.MANUFACTURER}_${Build.SERIAL}"
            
            // Gerar UUID baseado nas informações
            UUID.nameUUIDFromBytes(deviceInfo.toByteArray()).toString()
        } catch (e: Exception) {
            Timber.e(e, "Erro ao gerar UUID do dispositivo")
            UUID.randomUUID().toString()
        }
    }

    /**
     * Obter modelo do dispositivo
     */
    fun getDeviceModel(): String {
        return try {
            "${Build.MANUFACTURER} ${Build.MODEL}".trim()
        } catch (e: Exception) {
            "Desconhecido"
        }
    }

    /**
     * Obter versão do Android
     */
    fun getAndroidVersion(): String {
        return try {
            "${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})"
        } catch (e: Exception) {
            "Desconhecido"
        }
    }

    /**
     * Obter fabricante do dispositivo
     */
    fun getManufacturer(): String {
        return try {
            Build.MANUFACTURER.replaceFirstChar { 
                if (it.isLowerCase()) it.titlecase(Locale.getDefault()) else it.toString() 
            }
        } catch (e: Exception) {
            "Desconhecido"
        }
    }

    /**
     * Obter nível da bateria
     */
    fun getBatteryLevel(context: Context): Int {
        return try {
            val batteryIntent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            val level = batteryIntent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
            val scale = batteryIntent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
            
            if (level != -1 && scale != -1) {
                ((level.toFloat() / scale.toFloat()) * 100).toInt()
            } else {
                -1
            }
        } catch (e: Exception) {
            Timber.e(e, "Erro ao obter nível da bateria")
            -1
        }
    }

    /**
     * Verificar se a bateria está carregando
     */
    fun isBatteryCharging(context: Context): Boolean {
        return try {
            val batteryIntent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            val status = batteryIntent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
            
            status == BatteryManager.BATTERY_STATUS_CHARGING || 
            status == BatteryManager.BATTERY_STATUS_FULL
        } catch (e: Exception) {
            Timber.e(e, "Erro ao verificar carregamento da bateria")
            false
        }
    }

    /**
     * Obter tipo de rede
     */
    fun getNetworkType(context: Context): String {
        return try {
            val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val activeNetwork = connectivityManager.activeNetwork ?: return "Sem conexão"
                val networkCapabilities = connectivityManager.getNetworkCapabilities(activeNetwork) ?: return "Desconhecido"
                
                when {
                    networkCapabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "WiFi"
                    networkCapabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> {
                        getCellularNetworkType(context)
                    }
                    networkCapabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "Ethernet"
                    networkCapabilities.hasTransport(NetworkCapabilities.TRANSPORT_BLUETOOTH) -> "Bluetooth"
                    else -> "Outros"
                }
            } else {
                @Suppress("DEPRECATION")
                val activeNetworkInfo = connectivityManager.activeNetworkInfo
                when (activeNetworkInfo?.type) {
                    ConnectivityManager.TYPE_WIFI -> "WiFi"
                    ConnectivityManager.TYPE_MOBILE -> getCellularNetworkType(context)
                    else -> "Outros"
                }
            }
        } catch (e: Exception) {
            Timber.e(e, "Erro ao obter tipo de rede")
            "Desconhecido"
        }
    }

    /**
     * Obter tipo de rede celular específico
     */
    private fun getCellularNetworkType(context: Context): String {
        return try {
            val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
            
            when (telephonyManager.networkType) {
                TelephonyManager.NETWORK_TYPE_GPRS,
                TelephonyManager.NETWORK_TYPE_EDGE,
                TelephonyManager.NETWORK_TYPE_CDMA,
                TelephonyManager.NETWORK_TYPE_1xRTT,
                TelephonyManager.NETWORK_TYPE_IDEN -> "2G"
                
                TelephonyManager.NETWORK_TYPE_UMTS,
                TelephonyManager.NETWORK_TYPE_EVDO_0,
                TelephonyManager.NETWORK_TYPE_EVDO_A,
                TelephonyManager.NETWORK_TYPE_HSDPA,
                TelephonyManager.NETWORK_TYPE_HSUPA,
                TelephonyManager.NETWORK_TYPE_HSPA,
                TelephonyManager.NETWORK_TYPE_EVDO_B,
                TelephonyManager.NETWORK_TYPE_EHRPD,
                TelephonyManager.NETWORK_TYPE_HSPAP -> "3G"
                
                TelephonyManager.NETWORK_TYPE_LTE -> "4G"
                
                else -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    when (telephonyManager.networkType) {
                        TelephonyManager.NETWORK_TYPE_NR -> "5G"
                        else -> "Celular"
                    }
                } else {
                    "Celular"
                }
            }
        } catch (e: Exception) {
            "Celular"
        }
    }

    /**
     * Verificar se há conectividade de rede
     */
    fun isNetworkAvailable(context: Context): Boolean {
        return try {
            val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val activeNetwork = connectivityManager.activeNetwork ?: return false
                val networkCapabilities = connectivityManager.getNetworkCapabilities(activeNetwork) ?: return false
                
                networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
            } else {
                @Suppress("DEPRECATION")
                val activeNetworkInfo = connectivityManager.activeNetworkInfo
                activeNetworkInfo?.isConnected == true
            }
        } catch (e: Exception) {
            Timber.e(e, "Erro ao verificar conectividade")
            false
        }
    }

    /**
     * Verificar se está conectado via WiFi
     */
    fun isWiFiConnected(context: Context): Boolean {
        return try {
            val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val activeNetwork = connectivityManager.activeNetwork ?: return false
                val networkCapabilities = connectivityManager.getNetworkCapabilities(activeNetwork) ?: return false
                
                networkCapabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
            } else {
                @Suppress("DEPRECATION")
                val activeNetworkInfo = connectivityManager.activeNetworkInfo
                activeNetworkInfo?.type == ConnectivityManager.TYPE_WIFI && activeNetworkInfo.isConnected
            }
        } catch (e: Exception) {
            Timber.e(e, "Erro ao verificar WiFi")
            false
        }
    }

    /**
     * Obter informações da tela
     */
    fun getScreenInfo(context: Context): ScreenInfo {
        return try {
            val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
            val displayMetrics = DisplayMetrics()
            windowManager.defaultDisplay.getMetrics(displayMetrics)
            
            ScreenInfo(
                width = displayMetrics.widthPixels,
                height = displayMetrics.heightPixels,
                density = displayMetrics.density,
                densityDpi = displayMetrics.densityDpi
            )
        } catch (e: Exception) {
            Timber.e(e, "Erro ao obter informações da tela")
            ScreenInfo(0, 0, 0f, 0)
        }
    }

    /**
     * Obter espaço disponível em armazenamento
     */
    fun getAvailableStorageSpace(): Long {
        return try {
            val internalDir = File("/data/data")
            internalDir.usableSpace
        } catch (e: Exception) {
            Timber.e(e, "Erro ao obter espaço disponível")
            -1
        }
    }

    /**
     * Obter espaço total de armazenamento
     */
    fun getTotalStorageSpace(): Long {
        return try {
            val internalDir = File("/data/data")
            internalDir.totalSpace
        } catch (e: Exception) {
            Timber.e(e, "Erro ao obter espaço total")
            -1
        }
    }

    /**
     * Verificar se o dispositivo está rootado
     */
    fun isDeviceRooted(): Boolean {
        return try {
            // Verificar arquivos comuns de root
            val rootPaths = arrayOf(
                "/system/app/Superuser.apk",
                "/sbin/su",
                "/system/bin/su",
                "/system/xbin/su",
                "/data/local/xbin/su",
                "/data/local/bin/su",
                "/system/sd/xbin/su",
                "/system/bin/failsafe/su",
                "/data/local/su",
                "/su/bin/su"
            )
            
            rootPaths.any { File(it).exists() }
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Obter operadora de telefonia
     */
    @SuppressLint("MissingPermission")
    fun getCarrierName(context: Context): String {
        return try {
            val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
            telephonyManager.networkOperatorName ?: "Desconhecida"
        } catch (e: Exception) {
            "Desconhecida"
        }
    }

    /**
     * Obter todas as informações do dispositivo
     */
    fun getDeviceInfo(context: Context): Map<String, Any> {
        val screenInfo = getScreenInfo(context)
        
        return mapOf(
            "uuid" to generateDeviceUUID(context),
            "model" to getDeviceModel(),
            "manufacturer" to getManufacturer(),
            "android_version" to getAndroidVersion(),
            "sdk_int" to Build.VERSION.SDK_INT,
            "battery_level" to getBatteryLevel(context),
            "is_charging" to isBatteryCharging(context),
            "network_type" to getNetworkType(context),
            "is_wifi_connected" to isWiFiConnected(context),
            "is_network_available" to isNetworkAvailable(context),
            "screen_width" to screenInfo.width,
            "screen_height" to screenInfo.height,
            "screen_density" to screenInfo.density,
            "available_storage" to getAvailableStorageSpace(),
            "total_storage" to getTotalStorageSpace(),
            "is_rooted" to isDeviceRooted(),
            "carrier" to getCarrierName(context),
            "timestamp" to System.currentTimeMillis()
        )
    }

    /**
     * Verificar se o dispositivo tem recursos necessários
     */
    fun checkDeviceCapabilities(context: Context): DeviceCapabilities {
        return DeviceCapabilities(
            hasCamera = context.packageManager.hasSystemFeature("android.hardware.camera"),
            hasMicrophone = context.packageManager.hasSystemFeature("android.hardware.microphone"),
            hasGPS = context.packageManager.hasSystemFeature("android.hardware.location.gps"),
            hasTelephony = context.packageManager.hasSystemFeature("android.hardware.telephony"),
            hasWiFi = context.packageManager.hasSystemFeature("android.hardware.wifi"),
            hasBluetooth = context.packageManager.hasSystemFeature("android.hardware.bluetooth"),
            hasNFC = context.packageManager.hasSystemFeature("android.hardware.nfc"),
            hasFingerprint = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                context.packageManager.hasSystemFeature("android.hardware.fingerprint")
            } else false
        )
    }
}

/**
 * Data class para informações da tela
 */
data class ScreenInfo(
    val width: Int,
    val height: Int,
    val density: Float,
    val densityDpi: Int
)

/**
 * Data class para capacidades do dispositivo
 */
data class DeviceCapabilities(
    val hasCamera: Boolean,
    val hasMicrophone: Boolean,
    val hasGPS: Boolean,
    val hasTelephony: Boolean,
    val hasWiFi: Boolean,
    val hasBluetooth: Boolean,
    val hasNFC: Boolean,
    val hasFingerprint: Boolean
)