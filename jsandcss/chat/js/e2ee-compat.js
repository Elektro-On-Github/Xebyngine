/**
 * E2EE Compatibility Check
 * Verifica che il browser supporti Web Crypto API
 */

const E2EECompat = {
    /**
     * Controlla il supporto di Web Crypto API nel browser
     */
    checkSupport() {
        const checks = {
            crypto: !!window.crypto,
            subtle: !!window.crypto?.subtle,
            indexedDB: !!window.indexedDB,
            subtleEncrypt: !!window.crypto?.subtle?.encrypt,
            subtleDecrypt: !!window.crypto?.subtle?.decrypt,
            subtleImportKey: !!window.crypto?.subtle?.importKey
        };

        const allSupported = Object.values(checks).every(v => v === true);

        console.log('🔐 E2EE Compatibility Check:', {
            supported: allSupported,
            details: checks
        });

        if (!allSupported) {
            console.warn('⚠ Browser non supporta completamente Web Crypto API');
            console.warn('  E2EE potrebbe non funzionare correttamente');
            return false;
        }

        console.log('✓ Browser supporta E2EE completamente');
        return true;
    },

    /**
     * Controlla che IndexedDB sia disponibile e funzionante
     */
    checkIndexedDB() {
        return new Promise((resolve) => {
            if (!window.indexedDB) {
                console.warn('⚠ IndexedDB non disponibile');
                resolve(false);
                return;
            }

            try {
                const testDb = indexedDB.open('_compat_test_');
                testDb.onsuccess = () => {
                    const db = testDb.result;
                    db.close();
                    indexedDB.deleteDatabase('_compat_test_');
                    console.log('✓ IndexedDB funzionante');
                    resolve(true);
                };
                testDb.onerror = () => {
                    console.warn('⚠ IndexedDB non funzionante');
                    resolve(false);
                };
            } catch (e) {
                console.warn('⚠ IndexedDB non accessibile:', e);
                resolve(false);
            }
        });
    },

    /**
     * Esegui tutti i check
     */
    async checkAll() {
        const cryptoSupported = this.checkSupport();
        const idbSupported = await this.checkIndexedDB();

        if (!cryptoSupported || !idbSupported) {
            console.error('❌ Browser non supporta E2EE');
            return false;
        }

        console.log('✅ E2EE completamente supportato');
        return true;
    }
};

// Esegui i check al caricamento
document.addEventListener('DOMContentLoaded', async () => {
    const supported = await E2EECompat.checkAll();
    if (!supported) {
        console.error('E2EE non sarà disponibile in questo browser');
    }
});
