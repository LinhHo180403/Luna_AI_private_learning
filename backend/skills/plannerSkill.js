const Skill = require('./skill');
const ResponseBuilder = require('../core/responseBuilder');
const CommandTypes = require('../core/commandTypes');
const config = require('../config/config');
const { buildPlannerRequest } = require('../prompts/plannerPrompt');

const PLAN_TRIGGER_PATTERN = /(lập kế hoạch|len ke hoach|kế hoạch cho|ke hoach cho|make a plan|plan for)/i;
const TRIGGER_STRIP_PATTERN = /(lập kế hoạch cho|lập kế hoạch|len ke hoach cho|len ke hoach|kế hoạch cho|ke hoach cho|make a plan for|make a plan|plan for)/gi;

function extractTopic(message) {
  const cleaned = message.replace(TRIGGER_STRIP_PATTERN, '').trim();
  return cleaned.replace(/^[:\-–,\s]+/, '').trim() || 'mục tiêu của bạn';
}

function buildOfflinePlan(topic) {
  return {
    title: `Kế hoạch: ${topic}`,
    steps: [
      {
        title: 'Xác định mục tiêu cụ thể',
        detail: `Làm rõ kết quả mong muốn cho "${topic}" là gì, trong bao lâu.`,
      },
      {
        title: 'Thu thập thông tin / nghiên cứu',
        detail: 'Tìm hiểu các nguồn, công cụ, hoặc kiến thức cần thiết trước khi bắt tay vào làm.',
      },
      {
        title: 'Lên khung các bước nhỏ',
        detail: 'Chia nhỏ công việc thành các đầu việc có thể hoàn thành trong 1-2 buổi.',
      },
      {
        title: 'Thực hiện theo từng bước',
        detail: 'Bắt đầu với bước dễ nhất để tạo đà, rồi tới các bước khó hơn.',
      },
      {
        title: 'Rà soát và điều chỉnh',
        detail: 'Xem lại tiến độ, sửa những chỗ chưa ổn trước khi hoàn thiện.',
      },
    ],
    estimatedTime: 'Tuỳ quy mô mục tiêu (ước lượng thêm khi có Nara AI hỗ trợ)',
    generatedBy: 'offline-template',
  };
}

class PlannerSkill extends Skill {
  constructor() {
    super('PlannerSkill');
  }

  canHandle(context) {
    const msg = (context.message || '').trim();
    if (!msg) return false;
    return PLAN_TRIGGER_PATTERN.test(msg);
  }

  async handle(context) {
    const msg = (context.message || '').trim();
    const topic = extractTopic(msg);
    const builder = new ResponseBuilder().setSource('planner');

    let plan;
    if (config.AI_PROVIDER === 'nara') {
      try {
        const aiService = require('../services/aiService');
        const { system, user } = buildPlannerRequest(topic);
        plan = await aiService.generateStructured({ system, user });
        plan.generatedBy = 'nara';
      } catch (err) {
        console.error('[plannerSkill] Gọi AI thật thất bại, fallback offline template:', err.message);
        plan = buildOfflinePlan(topic);
        plan.generatedBy = 'offline-fallback-after-error';
      }
    } else {
      plan = buildOfflinePlan(topic);
    }

    return builder
      .setReply(`Luna đã lập xong kế hoạch cho "${topic}" rồi nè, xem ở thẻ bên dưới nha! 📋`)
      .setEmotion('excited')
      .setAnimation('talk')
      .addCommand(CommandTypes.SHOW_PLAN, { plan })
      .setData({ plan })
      .build();
  }
}

module.exports = PlannerSkill;
module.exports.extractTopic = extractTopic;
module.exports.buildOfflinePlan = buildOfflinePlan;
