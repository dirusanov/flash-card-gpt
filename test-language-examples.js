// Тестовый файл для проверки создания примеров на исходном языке
// Этот файл можно использовать для ручного тестирования функциональности

const testCases = [
  {
    word: "книга",
    sourceLanguage: "ru",
    targetLanguage: "en",
    description: "Русское слово, примеры должны быть на русском, перевод на английском"
  },
  {
    word: "hello",
    sourceLanguage: "en", 
    targetLanguage: "ru",
    description: "Английское слово, примеры должны быть на английском, перевод на русском"
  },
  {
    word: "bonjour",
    sourceLanguage: "fr",
    targetLanguage: "ru", 
    description: "Французское слово, примеры должны быть на французском, перевод на русском"
  },
  {
    word: "hola",
    sourceLanguage: "es",
    targetLanguage: "ru",
    description: "Испанское слово, примеры должны быть на испанском, перевод на русском"
  },
  {
    word: "สวัสดี", // sawasdii - привет на тайском
    sourceLanguage: "th",
    targetLanguage: "en",
    description: "Тайское слово, AI должна определить язык по коду 'th'"
  },
  {
    word: "مرحبا", // marhaba - привет на арабском
    sourceLanguage: "auto-detect",
    targetLanguage: "en", 
    description: "Арабское слово, AI сама должна определить язык (auto-detect)"
  }
];

console.log("🚀 ОБНОВЛЕНО: Тестовые случаи для проверки создания примеров с новым подходом");
console.log("=============================================================================");

testCases.forEach((testCase, index) => {
  console.log(`${index + 1}. ${testCase.word} (${testCase.sourceLanguage} → ${testCase.targetLanguage})`);
  console.log(`   ${testCase.description}`);
  console.log("");
});

console.log("✨ НОВЫЕ ВОЗМОЖНОСТИ:");
console.log("1. 🎯 AI сама определяет язык по коду (ru, fr, es, th, ar, etc.)");
console.log("2. 🧠 Умное автоопределение языка, если исходный язык не указан");
console.log("3. 🗑️  Убран хардкод - поддержка всех языков, которые понимает AI");
console.log("4. 🔧 Более простая поддержка и добавление новых языков");
console.log("");

console.log("📋 Инструкции для тестирования:");
console.log("1. Откройте Chrome extension в браузере");
console.log("2. Установите 'Source Language' в соответствующий язык ИЛИ включите Auto-detect");
console.log("3. Установите 'Your Language' в целевой язык");
console.log("4. Введите слово и нажмите 'Create Card'");
console.log("5. Проверьте, что примеры создаются на исходном языке");
console.log("6. Проверьте, что переводы примеров на целевом языке");
console.log("");

console.log("🔬 Особые тесты:");
console.log("• Попробуйте малораспространенные языки (тайский, арабский, грузинский)");
console.log("• Проверьте режим Auto-detect с разными языками");
console.log("• Убедитесь, что AI правильно понимает коды языков без хардкода");

// Экспорт для возможного использования в тестах
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { testCases };
} 