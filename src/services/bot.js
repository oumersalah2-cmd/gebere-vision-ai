const TelegramBot = require('node-telegram-bot-api');
const supabase = require('../db/database');
const { diagnoseCrop, downloadPhotoAsBase64 } = require('./ai');
require('dotenv').config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  polling: true
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
  }
};

async function getFarmerLanguage(telegramId) {
  try {
    const { data, error } = await supabase
      .from('farmers')
      .select('language')
      .eq('telegram_id', telegramId)
      .limit(1);

    if (error) {
      console.error('❌ Error getting language:', error.message);
      return 'amharic';
    }

    return data?.[0]?.language || 'amharic';

  } catch (err) {
    console.error('❌ getFarmerLanguage crashed:', err.message);
    return 'amharic';
  }
}

bot.onText(/\/start/, async (msg) => {
  const telegramId = msg.chat.id.toString();
  const firstName = msg.chat.first_name || 'Farmer';

  try {
    const { data: existing } = await supabase
      .from('farmers')
      .select('*')
      .eq('telegram_id', telegramId);

    if (!existing || existing.length === 0) {
      await supabase
        .from('farmers')
        .insert([{ telegram_id: telegramId, name: firstName }]);
      console.log(`✅ New farmer registered: ${firstName}`);
    }

    bot.sendMessage(
      msg.chat.id,
      `🌱 Welcome to Gebere Vision AI!\n\nPlease choose your language:\nቋንቋዎን ይምረጡ / Afaan filadhaa:`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '🇪🇹 አማርኛ (Amharic)', callback_data: 'lang_amharic' },
            { text: '🇪🇹 Afaan Oromo', callback_data: 'lang_oromo' }
          ]]
        }
      }
    );

  } catch (error) {
    console.error('❌ Error in /start:', error.message);
  }
});

bot.on('callback_query', async (query) => {
  const telegramId = query.message.chat.id.toString();
  const choice = query.data;

  try {
    await bot.answerCallbackQuery(query.id);

    // Handle language selection
    if (choice === 'lang_amharic' || choice === 'lang_oromo') {
      const language = choice === 'lang_amharic' ? 'amharic' : 'oromo';

      await supabase
        .from('farmers')
        .update({ language })
        .eq('telegram_id', telegramId);

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

      // Save feedback to database
      await supabase
        .from('diagnoses')
        .update({ feedback: isHelpful ? 'helpful' : 'not_helpful' })
        .eq('farmer_id', telegramId)
        .order('created_at', { ascending: false })
        .limit(1);

      const thankYou = language === 'oromo'
        ? isHelpful
          ? '🙏 Galatoomaa! Deebiin keessan nuuf baay\'ee barbaachisaadha.'
          : '🙏 Galatoomaa! Fooyya\'insaaf hojjenna.'
        : isHelpful
          ? '🙏 እናመሰግናለን! አስተያየትዎ ለእኛ በጣም አስፈላጊ ነው።'
          : '🙏 እናመሰግናለን! የተሻለ ለማድረግ እንሰራለን።';

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
  let language = 'amharic';

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

    const { error: dbError } = await supabase
      .from('diagnoses')
      .insert([{
        farmer_id: telegramId,
        gemini_result: diagnosis,
        crop_type: 'unknown'
      }]);

    if (dbError) {
      console.error('❌ DB save error:', dbError.message);
    } else {
      console.log('✅ Saved to database');
    }

    await bot.sendMessage(msg.chat.id, diagnosis);
    await bot.sendMessage(msg.chat.id, messages[language].follow_up);

// Send feedback buttons after diagnosis
const feedbackText = language === 'oromo'
  ? '👍 Qorannoon kun si gargaareeyyu?'
  : '👍 ይህ ምርመራ ጠቃሚ ነበር?';

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
          { text: '🇪🇹 Afaan Oromo', callback_data: 'lang_oromo' }
        ]]
      }
    }
  );
});

bot.onText(/\/help/, async (msg) => {
  const telegramId = msg.chat.id.toString();
  const language = await getFarmerLanguage(telegramId);

  const helpText = language === 'oromo'
    ? `🌱 *Gebere Vision AI - Gargaarsa*

📸 *Suuraa ergi* - Suuraa midhaan keessanii naa ergi, dhukkuba nan adda baasa

/start - Bot jalqabi
/help - Gargaarsa argadhu
/language - Afaan jijjiri
/about - Waa'ee bot kanaa baradhu

❓ Gaaffii yoo qabaattan suuraa erguun gaafficha ibsi.`
    : `🌱 *Gebere Vision AI - እርዳታ*

📸 *ፎቶ ይላኩ* - የሰብልዎን ፎቶ ይላኩልኝ፣ በሽታውን ወዲያው እለያለሁ

/start - ቦቱን ይጀምሩ
/help - እርዳታ ያግኙ
/language - ቋንቋ ይቀይሩ
/about - ስለ ቦቱ ይወቁ

❓ ጥያቄ ካለዎት ፎቶ ላኩና ጥያቄዎን ይጻፉ።`;

  bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'Markdown' });
});

bot.onText(/\/about/, async (msg) => {
  const telegramId = msg.chat.id.toString();
  const language = await getFarmerLanguage(telegramId);

  const aboutText = language === 'oromo'
    ? `🌱 *Waa'ee Gebere Vision AI*

Gebere Vision AI ogumaa qonnaa dijitaalaa keessan ta'a.

✅ Dhukkuba midhaan adda baasa
✅ Yaalii praktikaalaa kenna
✅ Afaan Oromoo fi Amaariffaan dubbata
✅ Tola — gatii hin baasu

🇪🇹 Qonnaan bultoota Itoophiyaaf kan uumame`
    : `🌱 *ስለ Gebere Vision AI*

Gebere Vision AI የእርስዎ ዲጂታል አግሮኖሚስት ነው።

✅ የሰብል በሽታዎችን ይለያል
✅ የህክምና ምክር ይሰጣል
✅ በአማርኛ እና አፋን ኦሮሞ ይናገራል
✅ ሙሉ በሙሉ ነፃ ነው

🇪🇹 ለኢትዮጵያ አርሶ አደሮች የተሰራ`;

  bot.sendMessage(msg.chat.id, aboutText, { parse_mode: 'Markdown' });
});

module.exports = bot;