import { extractWorkPoints, hasWorkDescription } from './work-points.util';

describe('work description points', () => {
  it.each([
    ['- First\n• Second\n* Third', ['First', 'Second', 'Third']],
    ['1. First\n2) Second', ['First', 'Second']],
    [
      '- [ ] First\n- [x] Second\n[ ] Third\n[X] Fourth',
      ['First', 'Second', 'Third', 'Fourth'],
    ],
    ['Overview\n- First\nContinuation\n- Second', ['First', 'Second']],
    [
      'First\nSecond\nThird\nFourth\nFifth\nSixth',
      ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth'],
    ],
    ['Single paragraph', []],
    [
      '- Add <Select> component\n- Check x < 10\n- Check y > 0',
      ['Add <Select> component', 'Check x < 10', 'Check y > 0'],
    ],
    [
      '- Render &nbsp; literally\n- Render &#160; literally',
      ['Render &nbsp; literally', 'Render &#160; literally'],
    ],
    ['- Review 👩‍💻 task\n- Next task', ['Review 👩‍💻 task', 'Next task']],
    ['\n  \n', []],
    ['- [ ]\n1.\n*\n[]', []],
    ['-\nOne paragraph', []],
  ])(
    'extracts %j without empty or truncated points',
    (description, expected) => {
      expect(extractWorkPoints(description)).toEqual(expected);
    },
  );

  it.each([undefined, null, '', ' \n\t', '- [ ]\n1.\n*\n[X]', '\u200B'])(
    'rejects descriptions without visible content: %j',
    (description) => {
      expect(hasWorkDescription(description)).toBe(false);
    },
  );

  it.each([
    'A paragraph',
    '- [ ] First task',
    '1) First task',
    'First\nSecond',
    '<p><br></p>',
    '<p>&nbsp;</p>',
    '<Select>',
    '&nbsp;',
  ])('accepts visible content: %j', (description) =>
    expect(hasWorkDescription(description)).toBe(true),
  );
});
