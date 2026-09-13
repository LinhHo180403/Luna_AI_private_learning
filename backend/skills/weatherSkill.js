const Skill = require('./skill');
const ResponseBuilder = require('../core/responseBuilder');

const WEATHER_TRIGGER_PATTERN = /(thời tiết|thoi tiet|weather)/i;
const CITY_PATTERN = /(?:ở|o|tại|tai|in|at)\s+([^\s?.,!]+(?:\s+[^\s?.,!]+){0,3})/i;

const TRAILING_QUESTION_WORDS = /\s*(thế nào|the nao|như thế nào|nhu the nao|ra sao|thế|the|sao|ra|nhỉ|nhi|vậy|vay|không|khong)\s*$/i;

function stripTrailingQuestionWords(cityRaw) {
  if (!cityRaw) return cityRaw;
  let cleaned = cityRaw;
  let prev;
  do {
    prev = cleaned;
    cleaned = cleaned.replace(TRAILING_QUESTION_WORDS, '').trim();
  } while (cleaned !== prev && cleaned.length > 0);
  return cleaned || null;
}

const MOCK_WEATHER_DB = {
  'đà nẵng': { tempC: 30, condition: 'nắng nhẹ', humidity: 70 },
  'da nang': { tempC: 30, condition: 'nắng nhẹ', humidity: 70 },
  'hà nội': { tempC: 27, condition: 'nhiều mây', humidity: 80 },
  'ha noi': { tempC: 27, condition: 'nhiều mây', humidity: 80 },
  'hồ chí minh': { tempC: 32, condition: 'mưa rào rải rác', humidity: 75 },
  'ho chi minh': { tempC: 32, condition: 'mưa rào rải rác', humidity: 75 },
  'sài gòn': { tempC: 32, condition: 'mưa rào rải rác', humidity: 75 },
};

const DEFAULT_MOCK = { tempC: 28, condition: 'trời quang, dễ chịu', humidity: 65 };

function getWeatherData(cityRaw) {
  if (!cityRaw) return { city: null, ...DEFAULT_MOCK };
  const key = cityRaw.trim().toLowerCase();
  const data = MOCK_WEATHER_DB[key] || DEFAULT_MOCK;
  return { city: cityRaw.trim(), ...data };
}

class WeatherSkill extends Skill {
  constructor() {
    super('WeatherSkill');
  }

  canHandle(context) {
    const msg = (context.message || '').trim();
    if (!msg) return false;
    return WEATHER_TRIGGER_PATTERN.test(msg);
  }

  async handle(context) {
    const msg = (context.message || '').trim();
    const builder = new ResponseBuilder().setSource('weather');

    const cityMatch = msg.match(CITY_PATTERN);
    const city = cityMatch ? stripTrailingQuestionWords(cityMatch[1]) : null;
    const data = getWeatherData(city);

    const cityLabel = data.city ? `ở ${data.city}` : '(mặc định do chưa rõ thành phố)';
    const reply = data.city
      ? `Thời tiết ${cityLabel}: ${data.condition}, khoảng ${data.tempC}°C, độ ẩm ${data.humidity}%. ` +
        `(Lưu ý: đây là dữ liệu mock offline, chưa nối API thời tiết thật nha!)`
      : `Luna chưa rõ bạn hỏi thời tiết ở đâu, nên trả tạm dữ liệu mẫu: ${data.condition}, ` +
        `khoảng ${data.tempC}°C. Bạn nói rõ tên thành phố để Luna trả chính xác hơn nhé!`;

    return builder
      .setReply(reply)
      .setEmotion(data.city ? 'happy' : 'curious')
      .setAnimation('talk')
      .setData({ weather: data, isMock: true })
      .build();
  }
}

module.exports = WeatherSkill;
module.exports.getWeatherData = getWeatherData;
