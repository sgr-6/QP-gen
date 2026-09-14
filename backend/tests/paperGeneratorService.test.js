jest.mock('../src/config/firebaseAdmin', () => ({
  db: {
    collection: jest.fn()
  },
  admin: {}
}));

const { buildValidSplit, validateAcademicRigor, getL1L2Marks } = require('../src/services/paperGeneratorService');

describe('Paper Generator Service', () => {
  describe('buildValidSplit', () => {
    it('should create a valid 2-question split totaling exactly targetMarks', () => {
      const pool = [
        { questionText: 'Q1', marks: 10, btl: 'L1', co: 'CO1' },
        { questionText: 'Q2', marks: 8, btl: 'L2', co: 'CO2' },
        { questionText: 'Q3', marks: 12, btl: 'L3', co: 'CO3' }
      ];
      
      const split = buildValidSplit(pool, 20);
      expect(split).toBeDefined();
      expect(split.length).toBe(2);
      
      const totalMarks = split.reduce((sum, q) => sum + q.marks, 0);
      expect(totalMarks).toBe(20);
    });

    it('should create a valid 3-question split if 2-question is not possible', () => {
      const pool = [
        { questionText: 'Q1', marks: 6, btl: 'L1', co: 'CO1' },
        { questionText: 'Q2', marks: 6, btl: 'L2', co: 'CO2' },
        { questionText: 'Q3', marks: 8, btl: 'L3', co: 'CO3' },
        { questionText: 'Q4', marks: 2, btl: 'L1', co: 'CO1' }
      ];
      
      const split = buildValidSplit(pool, 20);
      expect(split).toBeDefined();
      
      const totalMarks = split.reduce((sum, q) => sum + q.marks, 0);
      expect(totalMarks).toBe(20);
    });

    it('should fallback securely when given only one question', () => {
      const pool = [
        { questionText: 'Q1', marks: 10, btl: 'L1', co: 'CO1' }
      ];
      const split = buildValidSplit(pool, 20);
      
      expect(split).toBeDefined();
      expect(split.length).toBe(1);
      expect(split[0].marks).toBe(20);
    });
  });

  describe('validateAcademicRigor', () => {
    it('should not add a warning if max possible L1/L2 marks is <= 30', () => {
      const paper = {
        warnings: [],
        modules: [
          {
            moduleNumber: 'M1',
            splitA: [{ marks: 5, btl: 'L1' }, { marks: 15, btl: 'L3' }], // 5
            splitB: [{ marks: 10, btl: 'L2' }, { marks: 10, btl: 'L4' }] // 10
          }
        ]
      };
      
      validateAcademicRigor(paper);
      expect(paper.warnings.length).toBe(0);
    });

    it('should add a warning if max possible L1/L2 marks exceeds 30', () => {
      const paper = {
        warnings: [],
        modules: [
          {
            moduleNumber: 'M1',
            splitA: [{ marks: 20, btl: 'L1' }], // 20
            splitB: [{ marks: 10, btl: 'L2' }, { marks: 10, btl: 'L4' }] // 10
          },
          {
            moduleNumber: 'M2',
            splitA: [{ marks: 15, btl: 'L2' }, { marks: 5, btl: 'L3' }], // 15
            splitB: [{ marks: 20, btl: 'L3' }] // 0
          }
        ]
      };
      // Max L1/L2 = 20 (M1) + 15 (M2) = 35 > 30.
      
      validateAcademicRigor(paper);
      expect(paper.warnings.length).toBe(1);
      expect(paper.warnings[0]).toMatch(/exceeds the 30% limit/);
    });
  });
});
