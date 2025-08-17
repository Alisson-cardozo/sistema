package com.safekid.monitor.managers

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.os.Looper
import androidx.core.app.ActivityCompat
import androidx.lifecycle.lifecycleScope
import com.google.android.gms.location.*
import com.safekid.monitor.data.api.ApiService
import com.safekid.monitor.data.database.SafeKidDatabase
import com.safekid.monitor.data.entities.LocationEntity
import com.safekid.monitor.data.preferences.AppPreferences
import com.safekid.monitor.utils.CryptoUtils
import kotlinx.coroutines.launch
import org.koin.core.component.KoinComponent
import org.koin.core.component.inject
import timber.log.Timber
import java.util.*

class LocationManager(
    private val context: Context,
    private val preferences: AppPreferences
) : KoinComponent {

    private val apiService: ApiService by inject()
    private val database: SafeKidDatabase by inject()

    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private lateinit var locationRequest: LocationRequest
    private lateinit var locationCallback: LocationCallback

    private var isTracking = false
    private var lastKnownLocation: Location? = null
    private val pendingLocations = mutableListOf<LocationEntity>()

    companion object {
        private const val LOCATION_INTERVAL = 30 * 1000L // 30 segundos
        private const val FASTEST_INTERVAL = 15 * 1000L // 15 segundos
        private const val MAX_PENDING_LOCATIONS = 100
        private const val MIN_DISTANCE_METERS = 10f // Mínimo 10 metros para registrar
    }

    init {
        initializeLocationServices()
    }

    private fun initializeLocationServices() {
        try {
            fusedLocationClient = LocationServices.getFusedLocationProviderClient(context)
            
            locationRequest = LocationRequest.Builder(
                Priority.PRIORITY_HIGH_ACCURACY,
                LOCATION_INTERVAL
            ).apply {
                setMinUpdateIntervalMillis(FASTEST_INTERVAL)
                setMaxUpdateDelayMillis(LOCATION_INTERVAL * 2)
                setMinUpdateDistanceMeters(MIN_DISTANCE_METERS)
                setWaitForAccurateLocation(false)
            }.build()

            locationCallback = object : LocationCallback() {
                override fun onLocationResult(locationResult: LocationResult) {
                    super.onLocationResult(locationResult)
                    handleLocationUpdate(locationResult)
                }

                override fun onLocationAvailability(availability: LocationAvailability) {
                    super.onLocationAvailability(availability)
                    Timber.d("Location availability: ${availability.isLocationAvailable}")
                }
            }

            Timber.d("LocationManager inicializado")
        } catch (e: Exception) {
            Timber.e(e, "Erro ao inicializar LocationManager")
        }
    }

    fun startLocationTracking() {
        if (isTracking) return

        try {
            if (!hasLocationPermissions()) {
                Timber.w("Permissões de localização não concedidas")
                return
            }

            fusedLocationClient.requestLocationUpdates(
                locationRequest,
                locationCallback,
                Looper.getMainLooper()
            )

            isTracking = true
            Timber.d("Rastreamento de localização iniciado")

            // Obter última localização conhecida
            getLastKnownLocation()

        } catch (e: SecurityException) {
            Timber.e(e, "Erro de permissão ao iniciar rastreamento")
        } catch (e: Exception) {
            Timber.e(e, "Erro ao iniciar rastreamento de localização")
        }
    }

    fun stopLocationTracking() {
        if (!isTracking) return

        try {
            fusedLocationClient.removeLocationUpdates(locationCallback)
            isTracking = false
            Timber.d("Rastreamento de localização parado")
        } catch (e: Exception) {
            Timber.e(e, "Erro ao parar rastreamento de localização")
        }
    }

    private fun handleLocationUpdate(locationResult: LocationResult) {
        try {
            val location = locationResult.lastLocation ?: return

            // Verificar se a localização é válida
            if (!isValidLocation(location)) {
                Timber.w("Localização inválida recebida")
                return
            }

            // Verificar se houve mudança significativa
            if (!hasSignificantChange(location)) {
                return
            }

            lastKnownLocation = location
            
            // Criar entidade de localização
            val locationEntity = createLocationEntity(location)
            
            // Salvar no banco local
            saveLocationLocally(locationEntity)
            
            // Tentar enviar para o servidor
            sendLocationToServer(locationEntity)

            Timber.d("Localização processada: ${location.latitude}, ${location.longitude}")

        } catch (e: Exception) {
            Timber.e(e, "Erro ao processar atualização de localização")
        }
    }

    private fun isValidLocation(location: Location): Boolean {
        // Verificar se coordenadas são válidas
        if (location.latitude == 0.0 && location.longitude == 0.0) {
            return false
        }

        // Verificar se a precisão é aceitável (menos de 100 metros)
        if (location.accuracy > 100) {
            return false
        }

        // Verificar se não é muito antiga (máximo 5 minutos)
        val locationAge = System.currentTimeMillis() - location.time
        if (locationAge > 5 * 60 * 1000) {
            return false
        }

        return true
    }

    private fun hasSignificantChange(newLocation: Location): Boolean {
        val lastLocation = lastKnownLocation ?: return true

        // Calcular distância da última localização
        val distance = lastLocation.distanceTo(newLocation)
        
        // Verificar se houve mudança significativa na posição ou no tempo
        val timeDiff = newLocation.time - lastLocation.time
        val hasMovedEnough = distance >= MIN_DISTANCE_METERS
        val hasEnoughTimePassed = timeDiff >= FASTEST_INTERVAL

        return hasMovedEnough || hasEnoughTimePassed
    }

    private fun createLocationEntity(location: Location): LocationEntity {
        return LocationEntity(
            id = UUID.randomUUID().toString(),
            deviceId = preferences.getDeviceUuid(),
            latitude = location.latitude,
            longitude = location.longitude,
            accuracy = location.accuracy.toDouble(),
            altitude = if (location.hasAltitude()) location.altitude else null,
            speed = if (location.hasSpeed()) location.speed.toDouble() else null,
            timestamp = location.time,
            createdAt = System.currentTimeMillis(),
            synced = false
        )
    }

    private fun saveLocationLocally(locationEntity: LocationEntity) {
        try {
            // Usar coroutine para operação no banco
            kotlinx.coroutines.GlobalScope.launch {
                database.locationDao().insertLocation(locationEntity)
                
                // Limpar localizações antigas se necessário
                cleanupOldLocations()
            }
        } catch (e: Exception) {
            Timber.e(e, "Erro ao salvar localização no banco local")
        }
    }

    private fun sendLocationToServer(locationEntity: LocationEntity) {
        kotlinx.coroutines.GlobalScope.launch {
            try {
                val encryptedData = encryptLocationData(locationEntity)
                
                val response = apiService.sendLocation(
                    deviceUuid = preferences.getDeviceUuid(),
                    locationData = encryptedData
                )

                if (response.isSuccessful) {
                    // Marcar como sincronizada
                    database.locationDao().markAsSynced(locationEntity.id)
                    Timber.d("Localização enviada com sucesso")
                } else {
                    Timber.w("Falha ao enviar localização: ${response.code()}")
                    addToPendingQueue(locationEntity)
                }
            } catch (e: Exception) {
                Timber.e(e, "Erro ao enviar localização para servidor")
                addToPendingQueue(locationEntity)
            }
        }
    }

    private fun encryptLocationData(location: LocationEntity): Map<String, Any> {
        return try {
            mapOf(
                "device_id" to preferences.getDeviceUuid(),
                "latitude" to location.latitude,
                "longitude" to location.longitude,
                "accuracy" to location.accuracy,
                "altitude" to location.altitude,
                "speed" to location.speed,
                "data_hora" to Date(location.timestamp).toISOString(),
                "encrypted" to true
            )
        } catch (e: Exception) {
            Timber.e(e, "Erro ao criptografar dados de localização")
            mapOf(
                "device_id" to preferences.getDeviceUuid(),
                "latitude" to location.latitude,
                "longitude" to location.longitude,
                "data_hora" to Date(location.timestamp).toISOString(),
                "encrypted" to false
            )
        }
    }

    private fun addToPendingQueue(location: LocationEntity) {
        synchronized(pendingLocations) {
            pendingLocations.add(location)
            
            // Limitar tamanho da fila
            if (pendingLocations.size > MAX_PENDING_LOCATIONS) {
                pendingLocations.removeFirst()
            }
        }
    }

    suspend fun syncPendingLocations() {
        try {
            // Buscar localizações não sincronizadas do banco
            val unsyncedLocations = database.locationDao().getUnsyncedLocations()
            
            if (unsyncedLocations.isEmpty()) {
                return
            }

            Timber.d("Sincronizando ${unsyncedLocations.size} localizações pendentes")

            // Enviar em lotes
            val batchSize = 10
            unsyncedLocations.chunked(batchSize).forEach { batch ->
                try {
                    val batchData = batch.map { encryptLocationData(it) }
                    
                    val response = apiService.sendLocationsBatch(
                        deviceUuid = preferences.getDeviceUuid(),
                        locations = batchData
                    )

                    if (response.isSuccessful) {
                        // Marcar lote como sincronizado
                        val ids = batch.map { it.id }
                        database.locationDao().markBatchAsSynced(ids)
                        Timber.d("Lote de ${batch.size} localizações sincronizado")
                    }
                } catch (e: Exception) {
                    Timber.e(e, "Erro ao sincronizar lote de localizações")
                }
            }
        } catch (e: Exception) {
            Timber.e(e, "Erro na sincronização de localizações pendentes")
        }
    }

    private suspend fun cleanupOldLocations() {
        try {
            // Manter apenas os últimos 7 dias
            val sevenDaysAgo = System.currentTimeMillis() - (7 * 24 * 60 * 60 * 1000)
            val deletedCount = database.locationDao().deleteOldLocations(sevenDaysAgo)
            
            if (deletedCount > 0) {
                Timber.d("Removidas $deletedCount localizações antigas")
            }
        } catch (e: Exception) {
            Timber.e(e, "Erro ao limpar localizações antigas")
        }
    }

    private fun getLastKnownLocation() {
        try {
            if (!hasLocationPermissions()) return

            fusedLocationClient.lastLocation.addOnSuccessListener { location ->
                location?.let {
                    if (isValidLocation(it)) {
                        lastKnownLocation = it
                        Timber.d("Última localização conhecida obtida")
                    }
                }
            }
        } catch (e: SecurityException) {
            Timber.e(e, "Erro de permissão ao obter última localização")
        } catch (e: Exception) {
            Timber.e(e, "Erro ao obter última localização")
        }
    }

    private fun hasLocationPermissions(): Boolean {
        return ActivityCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED &&
        ActivityCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
    }

    fun isHealthy(): Boolean {
        return isTracking && hasLocationPermissions()
    }

    fun getCurrentLocation(): Location? {
        return lastKnownLocation
    }

    fun getTrackingStatus(): Map<String, Any> {
        return mapOf(
            "isTracking" to isTracking,
            "hasPermissions" to hasLocationPermissions(),
            "lastLocation" to (lastKnownLocation?.let {
                mapOf(
                    "latitude" to it.latitude,
                    "longitude" to it.longitude,
                    "accuracy" to it.accuracy,
                    "timestamp" to it.time
                )
            } ?: "null"),
            "pendingCount" to pendingLocations.size
        )
    }
}

// Extensão para converter Date para ISO String
private fun Date.toISOString(): String {
    val sdf = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
    sdf.timeZone = TimeZone.getTimeZone("UTC")
    return sdf.format(this)
}