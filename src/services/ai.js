const Groq = require('groq-sdk');
const axios = require('axios');
require('dotenv').config();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 3000;

async function downloadPhotoAsBase64(fileUrl) {
  const response = await axios.get(fileUrl, {
    responseType: 'arraybuffer'
  });
  const base64 = Buffer.from(response.data).toString('base64');
  return base64;
}

async function diagnoseCrop(photoBase64, language) {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
    console.log(`⏳ Waiting ${waitTime}ms...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  lastRequestTime = Date.now();

  try {
    // Step 1 - Diagnose in English first for maximum accuracy
    console.log(`🔍 Step 1: Diagnosing crop in English...`);

    const diagnosisResponse = await groq.chat.completions.create({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: [
        {
          role: 'system',
          content: `You are an expert Ethiopian agricultural extension officer and agronomist 
with 20 years of experience in Ethiopian farming conditions. 
You specialize in coffee and wheat crops common in Ethiopia.
Always provide practical advice using locally available solutions in Ethiopia.`
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this crop photo and respond in English with this exact format:

🌾 CROP: [identify the crop]

🔍 DIAGNOSIS: [what disease, pest, or weed do you see? If healthy say so clearly]

⚠️ SEVERITY: [Low / Medium / High]

💊 TREATMENT:
1. [first treatment step]
2. [second treatment step]
3. [third treatment step]
4. [fourth treatment step if needed]

🌱 PREVENTION:
1. [first prevention tip]
2. [second prevention tip]

Keep it simple and practical for smallholder farmers in Ethiopia.
If the image is not a crop or is unclear, say so politely.`
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${photoBase64}`
              }
            }
          ]
        }
      ],
      max_tokens: 1024
    });

    const englishDiagnosis = diagnosisResponse.choices[0].message.content;
    console.log('✅ English diagnosis received');

    // Step 2 - Translate to farmer's chosen language
    const targetLanguage = language === 'oromo'
      ? 'Afaan Oromo language using Latin alphabet only. Afaan Oromo does NOT use Ethiopic script.'
      : "Amharic language using Ethiopic Ge'ez script (አማርኛ) only.";

    console.log(`🌍 Step 2: Translating to ${language}...`);

    const translationResponse = await groq.chat.completions.create({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: [
        {
          role: 'system',
          content: `You are a professional Ethiopian language translator. 
You translate agricultural content accurately and naturally.
You only output the translated text — nothing else.
Never add explanations or notes about the translation.`
        },
        {
          role: 'user',
          content: `Translate the following agricultural crop diagnosis into ${targetLanguage}

Rules:
- Keep all emoji icons exactly as they are
- Keep the exact same format and structure
- Translate every word of text
- Do not add any extra text or notes
- ${language === 'oromo' ? 'Use ONLY Latin alphabet for Afaan Oromo — never use Ethiopic script' : 'Use ONLY Ethiopic Ge\'ez script for Amharic — never use English'}

Text to translate:
${englishDiagnosis}`
        }
      ],
      max_tokens: 1024
    });

    const translatedDiagnosis = translationResponse.choices[0].message.content;
    console.log(`✅ Translation to ${language} complete`);
    return translatedDiagnosis;

  } catch (error) {
    console.error('❌ Groq error:', error.message);

    if (language === 'oromo') {
      return 'Dhiifama, suuraa kee ilaalu hin dandeenye. Maaloo suuraa iftoomina qabu ergii.';
    } else {
      return 'ይቅርታ፣ ፎቶዎን ማየት አልቻልኩም። እባክዎ ግልጽ የሆነ ፎቶ ይላኩ።';
    }
  }
}

module.exports = { diagnoseCrop, downloadPhotoAsBase64 };