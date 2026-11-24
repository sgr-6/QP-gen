const {
  BLOOM, validLevel, normalizeModule, classifyBloom, mapCourseOutcome
} = require('../src/services/bloomService');

describe('Bloom cognitive-demand mapping', () => {
  test.each([
    ['L1', 'Define electrical resistance.'],
    ['L2', 'Explain the meaning of electrical resistance.'],
    ['L3', 'Calculate the current when 12 V is applied across a 6 ohm resistor.'],
    ['L4', 'Analyze the relationships between current, voltage and resistance.'],
    ['L5', 'Evaluate two resistor choices against power and cost criteria and justify your judgment.'],
    ['L6', 'Design an original resistor network under constraints of cost and power dissipation.']
  ])('recognizes %s from the demanded task', (level, text) => {
    expect(classifyBloom(text)).toMatchObject({
      btl: level, confidence: 'rule-based', rationale: BLOOM[level].definition,
      reviewRequired: false
    });
  });

  test.each([
    ['Compare series and parallel circuits.', 'L2'],
    ['Compare circuit components and their relationships using the supplied evidence.', 'L4'],
    ['Distinguish known types of electrical circuits.', 'L2'],
    ['Examine the causes of circuit bottlenecks.', 'L4'],
    ['Design a circuit using the given algorithm.', 'L3'],
    ['Construct a circuit using the given procedure.', 'L3'],
    ['Design an original circuit using the given algorithm under power constraints.', 'L6']
  ])('resolves overlapping action context: %s', (text, expected) => {
    expect(classifyBloom(text).btl).toBe(expected);
  });

  test.each([
    ['Define the term "design" in engineering.', 'L1'],
    ['List the stages named analyze, evaluate and create.', 'L1'],
    ['Explain why engineers compare and design circuits.', 'L2'],
    ['What does the phrase "evaluate an original design" mean?', 'L1']
  ])('does not promote verb mentions into cognitive demands: %s', (text, expected) => {
    expect(classifyBloom(text).btl).toBe(expected);
  });

  test('uses the highest actual demand across clauses and ignores image alt text', () => {
    expect(classifyBloom('1. Define resistance. Evaluate a resistor against the stated safety criteria.').btl).toBe('L5');
    expect(classifyBloom('Explain resistance. ![design an original circuit](https://example.invalid/circuit.png)').btl).toBe('L2');
  });

  test('flags an explicit tag that conflicts with the actual demand', () => {
    expect(classifyBloom('Define electrical resistance.', 'L6')).toMatchObject({
      btl: 'L1', confidence: 'rule-based', reviewRequired: true
    });
    expect(classifyBloom('Define electrical resistance.', 'L1').reviewRequired).toBe(false);
  });

  test('requires a substantive rationale for unresolved provisional labels', () => {
    expect(classifyBloom('Resistance terminology', 'L4', 'too short')).toMatchObject({
      btl: null, confidence: 'unresolved', reviewRequired: true
    });
    expect(classifyBloom('Resistance terminology', 'L4', 'Examine causal relationships within the supplied measurements.')).toMatchObject({
      btl: 'L4', confidence: 'ai-provisional', reviewRequired: true
    });
    expect(classifyBloom('Resistance terminology', 'L9', 'A sufficiently long but invalid proposed-level rationale.').btl).toBeNull();
  });

  test.each([
    ['M1', 'M1'], ['1', 'M1'], [1, 'M1'], ['Unit 2', 'M2'],
    ['module 03', 'M3'], ['m2', 'M2'], [null, null], ['', null],
    ['M0', null], ['Unit -2', null], ['CO1', null], ['M1 extra', null]
  ])('normalizes module %p to %p', (input, expected) => {
    expect(normalizeModule(input)).toBe(expected);
  });

  test.each(['L1', 'L2', 'L3', 'L4', 'L5', 'L6'])('accepts only taxonomy level %s', level => {
    expect(validLevel(level)).toBe(true);
  });
  test.each(['L0', 'L7', 'l1', '', null])('rejects invalid level %p', level => {
    expect(validLevel(level)).toBe(false);
  });
});

describe('Course outcomes are grounded in actual syllabus outcomes', () => {
  const syllabus = {
    courseOutcomes: [
      { id: 'CO7', description: 'Analyze resistor networks', modules: ['M1'] },
      { id: 'CO8', description: 'Evaluate thermal insulation', modules: ['M2'] }
    ]
  };

  test.each([null, {}, { courseOutcomes: [] }])('never invents a CO when outcomes are unavailable: %p', source => {
    expect(mapCourseOutcome('Design resistor networks.', source, 'CO1', 'M1')).toEqual({
      co: null, coMappingSource: 'unavailable'
    });
  });

  test('preserves an allowed real outcome provisionally, not a module-derived CO', () => {
    expect(mapCourseOutcome('Analyze resistor networks.', syllabus, 'CO7', 'M1')).toEqual({
      co: 'CO7', coMappingSource: 'syllabus-ai-provisional'
    });
    expect(mapCourseOutcome('Analyze resistor networks.', syllabus, 'CO999', 'M1')).toEqual({
      co: 'CO7', coMappingSource: 'syllabus-keywords-provisional'
    });
  });

  test('does not use outcomes outside their explicit module scope', () => {
    expect(mapCourseOutcome('Evaluate thermal insulation.', syllabus, 'CO8', 'M1')).toEqual({
      co: null, coMappingSource: 'unresolved'
    });
  });

  test('leaves unrelated and tied keyword matches unresolved', () => {
    expect(mapCourseOutcome('Describe photosynthesis.', syllabus, 'CO1', 'M1').co).toBeNull();
    const tied = { courseOutcomes: [
      { id: 'CO1', description: 'Analyze resistor networks' },
      { id: 'CO2', description: 'Explain resistor networks' }
    ] };
    expect(mapCourseOutcome('Define resistor networks.', tied, null, 'M1')).toEqual({
      co: null, coMappingSource: 'unresolved'
    });
  });
});
