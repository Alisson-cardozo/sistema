package com.safekid.monitor.services

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.telephony.SmsMessage
import android.util.Log
import com.safekid.monitor.managers.MessageManager
import com.safekid.monitor.SafeKidApplication

/**
 * BroadcastReceiver para interceptar SMS recebidos e enviados
 * Captura mensagens em tempo real para análise de conteúdo
 */
class SmsReceiver : BroadcastReceiver() {
    
    companion object {
        private const val TAG = "SmsReceiver"
    }
    
    override fun onReceive(context: Context?, intent: Intent?) {
        if (context == null || intent == null) return
        
        try {
            when (intent.action) {
                Telephony.Sms.Intents.SMS_RECEIVED_ACTION -> {
                    handleSmsReceived(context, intent)
                }
                Telephony.Sms.Intents.SMS_DELIVER_ACTION -> {
                    handleSmsDelivered(context, intent)
                }
                "android.provider.Telephony.SMS_SENT" -> {
                    handleSmsSent(context, intent)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao processar SMS: ${e.message}")
        }
    }
    
    /**
     * Trata SMS recebidos
     */
    private fun handleSmsReceived(context: Context, intent: Intent) {
        try {
            val pdus = intent.extras?.get("pdus") as? Array<*>
            val format = intent.extras?.getString("format")
            
            if (pdus != null) {
                for (pdu in pdus) {
                    val smsMessage = if (format != null) {
                        SmsMessage.createFromPdu(pdu as ByteArray, format)
                    } else {
                        SmsMessage.createFromPdu(pdu as ByteArray)
                    }
                    
                    smsMessage?.let { sms ->
                        val phoneNumber = sms.originatingAddress ?: "Unknown"
                        val messageBody = sms.messageBody ?: ""
                        val timestamp = sms.timestampMillis
                        
                        Log.i(TAG, "SMS recebido de: $phoneNumber")
                        Log.d(TAG, "Conteúdo: ${messageBody.take(50)}...")
                        
                        // Processa a mensagem
                        val messageManager = getMessageManager(context)
                        messageManager?.processNewMessage(
                            phoneNumber = phoneNumber,
                            content = messageBody,
                            timestamp = timestamp,
                            isReceived = true
                        )
                        
                        // Verifica se precisa análise de emergência
                        checkEmergencyKeywords(context, messageBody, phoneNumber)
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao processar SMS recebido: ${e.message}")
        }
    }
    
    /**
     * Trata SMS entregues (confirmação de entrega)
     */
    private fun handleSmsDelivered(context: Context, intent: Intent) {
        try {
            Log.d(TAG, "SMS entregue com sucesso")
            // Aqui podemos atualizar o status de entrega se necessário
        } catch (e: Exception) {
            Log.e(TAG, "Erro ao processar entrega de SMS: ${e.message}")
        }
    }