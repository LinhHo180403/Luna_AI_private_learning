class Skill {
  constructor(name) {
    if (new.target === Skill) {
      throw new Error('Skill là abstract class, không được khởi tạo trực tiếp.');
    }
    this.name = name || 'UnnamedSkill';
  }

  canHandle(context) {
    throw new Error(`Skill "${this.name}" chưa implement canHandle()`);
  }

  async handle(context) {
    throw new Error(`Skill "${this.name}" chưa implement handle()`);
  }
}

module.exports = Skill;
