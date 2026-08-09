const TelegramBot = require('node-telegram-bot-api');
const {
  getFarmerLanguage,
  registerFarmer,
  updateFarmerLanguage,
  saveDiagnosis,
  updateLatestFeedback
} = require('../db/database');
const { diagnoseCrop, downloadPhotoAsBase64 } = require('./ai');
require('dotenv').config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  polling: true
});

bot.on('polling_error', (error) => {
  console.error('❌ Telegram Polling Error:', error);
});

bot.on('error', (error) => {
  console.error('❌ Telegram General Error:', error);
});

console.log('🤖 Telegram bot is running...');

const messages = {
  amharic: {
    welcome: `🌱 *እንኳን ደህና መጡ - Gebere Vision AI*

እኔ የእርስዎ ዲጂታል አግሮኖሚስት ነኝ።
የሰብልዎን ፎቶ ይላኩልኝ።
በሽታ ወይም አረም ካለ ወዲያው እነግርዎታለሁ።`,
    photo_received: `📸 ፎቶዎ ደርሷል።\n🔍 እየተመረመረ ነው... እባክዎ ጥቂት ይጠብቁ።`,
    send_photo: `📸 የሰብልዎን ፎቶ ይላኩልኝ።`,
    language_saved: `✅ አማርኛ ተመርጧል።`,
    follow_up: `❓ ሌላ ጥያቄ ካለዎት ሌላ ፎቶ ይላኩልኝ።`,
    error: `❌ ይቅርታ፣ ችግር ተፈጥሯል። እባክዎ እንደገና ይሞክሩ።`
  },
  oromo: {
    welcome: `🌱 *Baga Nagaan Dhuftan - Gebere Vision AI*

Ani ogumaa qonnaa dijitaalaa keessan nan ta'a.
Suuraa midhaan keessanii naa ergi.
Dhukkuba yookiin hamaa yoo jiraate isiniif nan himna.`,
    photo_received: `📸 Suuraan keessan nu gahee jira.\n🔍 Qoratamaa jira... Maaloo daqiiqaa muraasa eegaa.`,
    send_photo: `📸 Suuraa midhaan keessanii naa ergi.`,
    language_saved: `✅ Afaan Oromoo filatameera.`,
    follow_up: `❓ Gaaffii yoo qabaattan, suuraa biroo naa erguu dandeessu.`,
    error: `❌ Dhiifama, rakkoo uumameera. Maaloo irra deebi'ii yaalii.`
  },
  english: {
    welcome: `🌱 *Welcome to Gebere Vision AI*

I am your digital agronomist assistant.
Please send me a photo of your crop.
I will diagnose any diseases or weeds and provide treatment advice.`,
    photo_received: `📸 Photo received.\n🔍 Analyzing... Please wait a moment.`,
    send_photo: `📸 Please send a photo of your crop.`,
    language_saved: `✅ English has been selected.`,
    follow_up: `❓ If you have another question, send another photo.`,
    error: `❌ Sorry, something went wrong. Please try again.`
  }
};

bot.onText(/\/start/, async (msg) => {
  const telegramId = msg.chat.id.toString();
  const firstName = msg.chat.first_name || 'Farmer';

  try {
    await registerFarmer(telegramId, firstName);
  } catch (error) {
    console.error('❌ Error in /start registerFarmer:', error.message);
  }

  bot.sendMessage(
    msg.chat.id,
    `🌱 Welcome to Gebere Vision AI!\n\nPlease choose your language:\nቋንቋዎን ይምረጡ / Afaan filadhaa:`,
    {
      reply_markup: {
        inline_keyboard: [[
          { text: '🇪🇹 አማርኛ (Amharic)', callback_data: 'lang_amharic' },
          { text: '🇪🇹 Afaan Oromo', callback_data: 'lang_oromo' },
          { text: '🇬🇧 English', callback_data: 'lang_english' }
        ]]
      }
    }
  );
});

bot.on('callback_query', async (query) => {
  if (!query.message || !query.message.chat) return;
  const telegramId = query.message.chat.id.toString();
  const choice = query.data;

  try {
    await bot.answerCallbackQuery(query.id);

    // Handle language selection
    if (choice === 'lang_amharic' || choice === 'lang_oromo' || choice === 'lang_english') {
      let language = 'english';
      if (choice === 'lang_amharic') language = 'amharic';
      if (choice === 'lang_oromo') language = 'oromo';

      try {
        await updateFarmerLanguage(telegramId, language);
      } catch (error) {
        console.error('❌ Error saving language preference:', error.message);
      }

      console.log(`✅ Farmer ${telegramId} chose: ${language}`);

      const lang = messages[language];
      await bot.sendMessage(query.message.chat.id, lang.language_saved);
      await bot.sendMessage(query.message.chat.id, lang.welcome, {
        parse_mode: 'Markdown'
      });
    }

    // Handle feedback
    if (choice.startsWith('feedback_')) {
      const isHelpful = choice.includes('helpful') && !choice.includes('nothelpful');
      const language = await getFarmerLanguage(telegramId);
      const feedback = isHelpful ? 'helpful' : 'not_helpful';

      try {
        await updateLatestFeedback(telegramId, feedback);
      } catch (error) {
        console.error('❌ Error saving feedback:', error.message);
      }

      let thankYou = '';
      if (language === 'oromo') {
        thankYou = isHelpful
          ? '🙏 Galatoomaa! Deebiin keessan nuuf baay\'ee barbaachisaadha.'
          : '🙏 Galatoomaa! Fooyya\'insaaf hojjenna.';
      } else if (language === 'amharic') {
        thankYou = isHelpful
          ? '🙏 እናመሰግናለን! አስተያየትዎ ለእኛ በጣም አስፈላጊ ነው።'
          : '🙏 እናመሰግናለን! የተሻለ ለማድረግ እንሰራለን።';
      } else {
        thankYou = isHelpful
          ? '🙏 Thank you! Your feedback is very important to us.'
          : '🙏 Thank you! We will work to make it better.';
      }

      await bot.sendMessage(query.message.chat.id, thankYou);
      console.log(`📊 Feedback from ${telegramId}: ${isHelpful ? 'helpful' : 'not helpful'}`);
    }

  } catch (error) {
    console.error('❌ Error in callback_query:', error.message);
  }
});
    

bot.on('message', async (msg) => {
  if (msg.text && msg.text.startsWith('/')) return;
  if (msg.photo) return;

  const telegramId = msg.chat.id.toString();
  try {
    const language = await getFarmerLanguage(telegramId);
    await bot.sendMessage(msg.chat.id, messages[language].send_photo);
  } catch (error) {
    console.error('❌ Error in message handler:', error.message);
  }
});

bot.on('photo', async (msg) => {
  const telegramId = msg.chat.id.toString();
  let language = 'english';

  try {
    language = await getFarmerLanguage(telegramId);
    console.log(`📸 Photo from ${telegramId} [${language}]`);

    await bot.sendMessage(msg.chat.id, messages[language].photo_received);

    const bestPhoto = msg.photo[msg.photo.length - 1];
    const file = await bot.getFile(bestPhoto.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

    const photoBase64 = await downloadPhotoAsBase64(fileUrl);
    console.log(`✅ Photo downloaded: ${photoBase64.length} chars`);

    console.log(`🤖 Sending to Gemini [${language}]...`);
    const diagnosis = await diagnoseCrop(photoBase64, language);
    console.log(`✅ Diagnosis received`);

    try {
      await saveDiagnosis(telegramId, diagnosis);
    } catch (dbError) {
      console.error('❌ DB save error:', dbError.message);
    }

    await bot.sendMessage(msg.chat.id, diagnosis);
    await bot.sendMessage(msg.chat.id, messages[language].follow_up);

    // Send feedback buttons after diagnosis
    let feedbackText = '👍 Was this diagnosis helpful?';
    if (language === 'oromo') {
      feedbackText = '👍 Qorannoon kun si gargaareeyyu?';
    } else if (language === 'amharic') {
      feedbackText = '👍 ይህ ምርመራ ጠቃሚ ነበር?';
    }

    await bot.sendMessage(msg.chat.id, feedbackText, {
      reply_markup: {
        inline_keyboard: [[
          { text: '👍 Helpful', callback_data: `feedback_helpful_${msg.chat.id}` },
          { text: '👎 Not helpful', callback_data: `feedback_nothelpful_${msg.chat.id}` }
        ]]
      }
    });

  } catch (error) {
    console.error('❌ Photo handler error:', error.message);
    await bot.sendMessage(msg.chat.id, messages[language].error);
  }
});

bot.onText(/\/language/, async (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `🌍 Choose your language:\nቋንቋዎን ይምረጡ / Afaan filadhaa:`,
    {
      reply_markup: {
        inline_keyboard: [[
          { text: '🇪🇹 አማርኛ (Amharic)', callback_data: 'lang_amharic' },
          { text: '🇪🇹 Afaan Oromo', callback_data: 'lang_oromo' },
          { text: '🇬🇧 English', callback_data: 'lang_english' }
        ]]
      }
    }
  );
});

bot.onText(/\/help/, async (msg) => {
  const telegramId = msg.chat.id.toString();
  const language = await getFarmerLanguage(telegramId);

  let helpText = '';
  if (language === 'oromo') {
    helpText = `🌱 *Gebere Vision AI - Gargaarsa*

📸 *Suuraa ergi* - Suuraa midhaan keessanii naa ergi, dhukkuba nan adda baasa

/start - Bot jalqabi
/help - Gargaarsa argadhu
/language - Afaan jijjiri
/about - Waa'ee bot kanaa baradhu

❓ Gaaffii yoo qabaattan suuraa erguun gaafficha ibsi.`;
  } else if (language === 'amharic') {
    helpText = `🌱 *Gebere Vision AI - እርዳታ*

📸 *ፎቶ ይላኩ* - የሰብልዎን ፎቶ ይላኩልኝ፣ በሽታውን ወዲያው እለያለሁ

/start - ቦቱን ይጀምሩ
/help - እርዳታ ያግኙ
/language - ቋንቋ ይቀይሩ
/about - ስለ ቦቱ ይወቁ

❓ ጥያቄ ካለዎት ፎቶ ላኩና ጥያቄዎን ይጻፉ።`;
  } else {
    helpText = `🌱 *Gebere Vision AI - Help*

📸 *Send a Photo* - Send a photo of your crop, and I will diagnose any diseases or weeds.

/start - Start the bot
/help - Get help
/language - Change language
/about - Learn about the bot

❓ If you have questions, send a photo and ask your question.`;
  }

  bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'Markdown' });
});

bot.onText(/\/about/, async (msg) => {
  const telegramId = msg.chat.id.toString();
  const language = await getFarmerLanguage(telegramId);

  let aboutText = '';
  if (language === 'oromo') {
    aboutText = `🌱 *Waa'ee Gebere Vision AI*

Gebere Vision AI ogumaa qonnaa dijitaalaa keessan ta'a.

✅ Dhukkuba midhaan adda baasa
✅ Yaalii praktikaalaa kenna
✅ Afaan Oromoo fi Amaariffaan dubbata
✅ Tola — gatii hin baasu

🇪🇹 Qonnaan bultoota Itoophiyaaf kan uumame`;
  } else if (language === 'amharic') {
    aboutText = `🌱 *ስለ Gebere Vision AI*

Gebere Vision AI የእርስዎ ዲጂታል አግሮኖሚስት ነው።

✅ የሰብል በሽታዎችን ይለያል
✅ የህክምና ምክር ይሰጣል
✅ በአማርኛ እና አፋን ኦሮሞ ይናገራል
✅ ሙሉ በሙሉ ነፃ ነው

🇪🇹 ለኢትዮጵያ አርሶ አደሮች የተሰራ`;
  } else {
    aboutText = `🌱 *About Gebere Vision AI*

Gebere Vision AI is a zero-friction, voice-enabled, and image-based crop disease diagnostics bot designed for smallholder farmers.

✅ *Zero-Friction*: Works directly inside Telegram.
✅ *Double-Shield Guide*: Actionable cultural & chemical remedies.
✅ *Multilingual*: Supports English, Amharic, and Oromo.
✅ *CABI-Grounded*: Hallucination-free diagnostics.
✅ *100% Free*

🇪🇹 Built for agricultural hubs starting in Ethiopia.`;
  }

  bot.sendMessage(msg.chat.id, aboutText, { parse_mode: 'Markdown' });
});

module.exports = bot;