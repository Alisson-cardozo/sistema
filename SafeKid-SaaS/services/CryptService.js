const crypto = require('crypto');

class CryptService {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32; // 256 bits
    this.ivLength = 16;  // 128 bits
    this.tagLength = 16; // 128 bits
    this.saltLength = 64; // 512 bits
    this.iterations = 100000; // PBKDF2 iterations
    
    // Chave mestra do ambiente
    this.masterKey = process.env.ENCRYPTION_KEY || this.generateRandomKey();
    
    if (!process.env.ENCRYPTION_KEY) {
      console.warn('⚠️ ENCRYPTION_KEY não definido - usando chave temporária');
    }
    
    console.log('✅ Serviço de criptografia inicializado');
  }

  // Gerar chave aleatória
  generateRandomKey(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  // Gerar salt aleatório
  generateSalt() {
    return crypto.randomBytes(this.saltLength);
  }

  // Derivar chave usando PBKDF2
  deriveKey(password, salt, iterations = this.iterations) {
    return crypto.pbkdf2Sync(password, salt, iterations, this.keyLength, 'sha256');
  }

  // Criptografar dados sensíveis
  encrypt(plaintext, password = null) {
    try {
      const key = password ? 
        this.deriveKey(password, Buffer.from(this.masterKey, 'hex')) : 
        Buffer.from(this.masterKey, 'hex');
      
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipher(this.algorithm, key, iv);
      
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag();
      
      // Retornar dados concatenados: iv + tag + encrypted
      return iv.toString('hex') + tag.toString('hex') + encrypted;
    } catch (error) {
      console.error('Erro na criptografia:', error);
      throw new Error('Falha ao criptografar dados');
    }
  }

  // Descriptografar dados
  decrypt(encryptedData, password = null) {
    try {
      const key = password ? 
        this.deriveKey(password, Buffer.from(this.masterKey, 'hex')) : 
        Buffer.from(this.masterKey, 'hex');
      
      // Extrair IV, tag e dados criptografados
      const iv = Buffer.from(encryptedData.slice(0, this.ivLength * 2), 'hex');
      const tag = Buffer.from(encryptedData.slice(this.ivLength * 2, (this.ivLength + this.tagLength) * 2), 'hex');
      const encrypted = encryptedData.slice((this.ivLength + this.tagLength) * 2);
      
      const decipher = crypto.createDecipher(this.algorithm, key, iv);
      decipher.setAuthTag(tag);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('Erro na descriptografia:', error);
      throw new Error('Falha ao descriptografar dados');
    }
  }

  // Criptografar mensagens (para banco de dados)
  encryptMessage(messageText, deviceId = null) {
    try {
      // Usar device_id como salt adicional se disponível
      const salt = deviceId ? 
        crypto.createHash('sha256').update(deviceId + this.masterKey).digest() :
        Buffer.from(this.masterKey, 'hex');
      
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipherGCM(this.algorithm, salt.slice(0, this.keyLength));
      cipher.setIVLength(this.ivLength);
      
      let encrypted = cipher.update(messageText, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag();
      
      return {
        encrypted: iv.toString('hex') + tag.toString('hex') + encrypted,
        algorithm: this.algorithm,
        iv: iv.toString('hex'),
        tag: tag.toString('hex')
      };
    } catch (error) {
      console.error('Erro ao criptografar mensagem:', error);
      return {
        encrypted: messageText, // Fallback: retornar texto plano em caso de erro
        algorithm: 'none',
        error: error.message
      };
    }
  }

  // Descriptografar mensagens
  decryptMessage(encryptedData, deviceId = null) {
    try {
      if (typeof encryptedData === 'string') {
        // Formato legado ou texto plano
        if (encryptedData.length < (this.ivLength + this.tagLength) * 2) {
          return encryptedData; // Provavelmente texto plano
        }
        
        const salt = deviceId ? 
          crypto.createHash('sha256').update(deviceId + this.masterKey).digest() :
          Buffer.from(this.masterKey, 'hex');
        
        const iv = Buffer.from(encryptedData.slice(0, this.ivLength * 2), 'hex');
        const tag = Buffer.from(encryptedData.slice(this.ivLength * 2, (this.ivLength + this.tagLength) * 2), 'hex');
        const encrypted = encryptedData.slice((this.ivLength + this.tagLength) * 2);
        
        const decipher = crypto.createDecipherGCM(this.algorithm, salt.slice(0, this.keyLength));
        decipher.setIVLength(this.ivLength);
        decipher.setAuthTag(tag);
        
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
      }
      
      return encryptedData; // Se não for string, retornar como está
    } catch (error) {
      console.error('Erro ao descriptografar mensagem:', error);
      return encryptedData; // Retornar dados originais em caso de erro
    }
  }

  // Hash seguro para senhas
  hashPassword(password, salt = null) {
    try {
      const useSalt = salt || this.generateSalt();
      const hash = crypto.pbkdf2Sync(password, useSalt, this.iterations, 64, 'sha256');
      
      return {
        hash: hash.toString('hex'),
        salt: useSalt.toString('hex'),
        iterations: this.iterations
      };
    } catch (error) {
      console.error('Erro ao gerar hash da senha:', error);
      throw new Error('Falha ao processar senha');
    }
  }

  // Verificar senha
  verifyPassword(password, hash, salt) {
    try {
      const saltBuffer = Buffer.from(salt, 'hex');
      const hashBuffer = crypto.pbkdf2Sync(password, saltBuffer, this.iterations, 64, 'sha256');
      const computedHash = hashBuffer.toString('hex');
      
      // Comparação segura contra timing attacks
      return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(computedHash, 'hex'));
    } catch (error) {
      console.error('Erro ao verificar senha:', error);
      return false;
    }
  }

  // Gerar token seguro
  generateSecureToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  // Gerar UUID v4
  generateUUID() {
    return crypto.randomUUID();
  }

  // Hash para integridade de dados
  createHash(data, algorithm = 'sha256') {
    return crypto.createHash(algorithm).update(data).digest('hex');
  }

  // HMAC para verificação de integridade
  createHMAC(data, secret = null) {
    const key = secret || this.masterKey;
    return crypto.createHmac('sha256', key).update(data).digest('hex');
  }

  // Verificar HMAC
  verifyHMAC(data, providedHmac, secret = null) {
    const expectedHmac = this.createHMAC(data, secret);
    return crypto.timingSafeEqual(Buffer.from(providedHmac, 'hex'), Buffer.from(expectedHmac, 'hex'));
  }

  // Criptografar arquivo
  encryptFile(filePath, outputPath = null) {
    return new Promise((resolve, reject) => {
      try {
        const fs = require('fs');
        const path = require('path');
        
        const output = outputPath || filePath + '.encrypted';
        const iv = crypto.randomBytes(this.ivLength);
        const key = Buffer.from(this.masterKey, 'hex');
        
        const cipher = crypto.createCipherGCM(this.algorithm, key);
        const input = fs.createReadStream(filePath);
        const outputStream = fs.createWriteStream(output);
        
        // Escrever IV no início do arquivo
        outputStream.write(iv);
        
        cipher.setIVLength(this.ivLength);
        
        input.pipe(cipher).pipe(outputStream);
        
        outputStream.on('finish', () => {
          const tag = cipher.getAuthTag();
          
          // Append tag ao final do arquivo
          fs.appendFileSync(output, tag);
          
          resolve({
            success: true,
            encryptedFile: output,
            originalSize: fs.statSync(filePath).size,
            encryptedSize: fs.statSync(output).size
          });
        });
        
        outputStream.on('error', reject);
        input.on('error', reject);
        cipher.on('error', reject);
        
      } catch (error) {
        reject(error);
      }
    });
  }

  // Descriptografar arquivo
  decryptFile(encryptedFilePath, outputPath = null) {
    return new Promise((resolve, reject) => {
      try {
        const fs = require('fs');
        const path = require('path');
        
        const output = outputPath || encryptedFilePath.replace('.encrypted', '');
        const key = Buffer.from(this.masterKey, 'hex');
        
        const encryptedData = fs.readFileSync(encryptedFilePath);
        
        // Extrair IV, tag e dados
        const iv = encryptedData.slice(0, this.ivLength);
        const tag = encryptedData.slice(-this.tagLength);
        const encrypted = encryptedData.slice(this.ivLength, -this.tagLength);
        
        const decipher = crypto.createDecipherGCM(this.algorithm, key);
        decipher.setIVLength(this.ivLength);
        decipher.setAuthTag(tag);
        
        const decrypted = decipher.update(encrypted, null, null);
        const final = decipher.final();
        
        const result = Buffer.concat([decrypted, final]);
        fs.writeFileSync(output, result);
        
        resolve({
          success: true,
          decryptedFile: output,
          originalSize: fs.statSync(encryptedFilePath).size,
          decryptedSize: result.length
        });
        
      } catch (error) {
        reject(error);
      }
    });
  }

  // Criptografar dados JSON
  encryptJSON(jsonData, password = null) {
    try {
      const jsonString = JSON.stringify(jsonData);
      return this.encrypt(jsonString, password);
    } catch (error) {
      console.error('Erro ao criptografar JSON:', error);
      throw new Error('Falha ao criptografar dados JSON');
    }
  }

  // Descriptografar dados JSON
  decryptJSON(encryptedData, password = null) {
    try {
      const decryptedString = this.decrypt(encryptedData, password);
      return JSON.parse(decryptedString);
    } catch (error) {
      console.error('Erro ao descriptografar JSON:', error);
      throw new Error('Falha ao descriptografar dados JSON');
    }
  }

  // Gerar chave de API
  generateAPIKey(userId, deviceId = null) {
    const timestamp = Date.now();
    const random = this.generateSecureToken(16);
    const data = `${userId}:${deviceId}:${timestamp}:${random}`;
    
    return {
      key: Buffer.from(data).toString('base64'),
      hash: this.createHMAC(data),
      created: new Date(timestamp),
      userId,
      deviceId
    };
  }

  // Validar chave de API
  validateAPIKey(apiKey, expectedHash) {
    try {
      const decoded = Buffer.from(apiKey, 'base64').toString('utf8');
      const computedHash = this.createHMAC(decoded);
      
      return crypto.timingSafeEqual(Buffer.from(expectedHash, 'hex'), Buffer.from(computedHash, 'hex'));
    } catch (error) {
      return false;
    }
  }

  // Criptografar credenciais do dispositivo
  encryptDeviceCredentials(credentials) {
    return {
      uuid: this.encrypt(credentials.uuid),
      secret: this.encrypt(credentials.secret),
      type: credentials.type // Não criptografar o tipo
    };
  }

  // Descriptografar credenciais do dispositivo
  decryptDeviceCredentials(encryptedCredentials) {
    return {
      uuid: this.decrypt(encryptedCredentials.uuid),
      secret: this.decrypt(encryptedCredentials.secret),
      type: encryptedCredentials.type
    };
  }

  // Obter informações do serviço
  getServiceInfo() {
    return {
      algorithm: this.algorithm,
      keyLength: this.keyLength,
      ivLength: this.ivLength,
      tagLength: this.tagLength,
      iterations: this.iterations,
      masterKeyConfigured: !!process.env.ENCRYPTION_KEY,
      features: [
        'AES-256-GCM encryption',
        'PBKDF2 key derivation',
        'HMAC integrity verification',
        'Secure token generation',
        'File encryption',
        'JSON encryption'
      ]
    };
  }

  // Verificar integridade do serviço
  selfTest() {
    try {
      const testData = 'SafeKid encryption test';
      const encrypted = this.encrypt(testData);
      const decrypted = this.decrypt(encrypted);
      
      if (testData !== decrypted) {
        throw new Error('Teste de criptografia/descriptografia falhou');
      }

      const testHash = this.createHash(testData);
      const testHmac = this.createHMAC(testData);
      
      if (!testHash || !testHmac) {
        throw new Error('Teste de hash/HMAC falhou');
      }

      console.log('✅ Teste de integridade do CryptService passou');
      return { success: true, message: 'Todos os testes passaram' };
    } catch (error) {
      console.error('❌ Teste de integridade do CryptService falhou:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new CryptService();