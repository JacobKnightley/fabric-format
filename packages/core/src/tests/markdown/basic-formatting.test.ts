/**
 * Markdown Basic Formatting Tests
 *
 * Tests that the Markdown formatter (dprint) works correctly.
 * We don't test dprint's formatting deeply - just that our integration works.
 * Note: dprint's markdown plugin primarily normalizes whitespace and doesn't
 * auto-fix malformed syntax.
 */
import type { TestSuite } from '../framework.js';

export const basicFormattingTests: TestSuite = {
  name: 'Markdown Basic Formatting',
  tests: [
    // Heading normalization
    {
      name: 'H1 heading with space preserved',
      input: '# Hello World',
      expected: '# Hello World',
    },
    {
      name: 'H2 heading with extra spaces normalized',
      input: '##   Section Title',
      expected: '## Section Title',
    },
    {
      name: 'H3 heading preserved',
      input: '### Subsection',
      expected: '### Subsection',
    },

    // List formatting
    {
      name: 'Unordered list standardization',
      input: '*  Item one\n*  Item two\n*  Item three',
      expected: '- Item one\n- Item two\n- Item three',
    },
    {
      name: 'Ordered list preserved',
      input: '1. First\n2. Second\n3. Third',
      expected: '1. First\n2. Second\n3. Third',
    },

    // Emphasis standardization
    {
      name: 'Emphasis with asterisks preserved',
      input: '*emphasis*',
      expected: '*emphasis*',
    },
    {
      name: 'Strong with asterisks preserved',
      input: '**strong**',
      expected: '**strong**',
    },

    // Code preservation
    {
      name: 'Inline code preserved',
      input: 'Use `code` here',
      expected: 'Use `code` here',
    },
    {
      name: 'Code block preserved',
      input: '```python\nx = 1\n```',
      expected: '```python\nx = 1\n```',
    },
    {
      name: 'Fenced code block with language',
      input: '```sql\nSELECT * FROM table\n```',
      expected: '```sql\nSELECT * FROM table\n```',
    },

    // Paragraph handling
    {
      name: 'Paragraph whitespace normalization',
      input: 'Hello   world',
      expected: 'Hello world',
    },
    {
      name: 'Multiple paragraphs separated',
      input: 'First paragraph.\n\nSecond paragraph.',
      expected: 'First paragraph.\n\nSecond paragraph.',
    },

    // Link and image formatting
    {
      name: 'Link formatting preserved',
      input: '[Link Text](https://example.com)',
      expected: '[Link Text](https://example.com)',
    },
    {
      name: 'Image formatting preserved',
      input: '![Alt text](image.png)',
      expected: '![Alt text](image.png)',
    },

    // Quote formatting
    {
      name: 'Block quote formatting',
      input: '>Quote text',
      expected: '> Quote text',
    },
    {
      name: 'Multi-line block quote',
      input: '>Line 1\n>Line 2',
      expected: '> Line 1\n> Line 2',
    },

    // Already formatted code
    {
      name: 'Already formatted code unchanged',
      input: '# Hello World\n\nParagraph text.',
      expected: '# Hello World\n\nParagraph text.',
    },

    // Empty/whitespace handling
    {
      name: 'Empty string',
      input: '',
      expected: '',
    },

    // Table formatting - dprint normalizes separator
    {
      name: 'Table with normalized separator',
      input: '| A | B |\n|---|---|\n| 1 | 2 |',
      expected: '| A | B |\n| - | - |\n| 1 | 2 |',
    },

    // Horizontal rule
    {
      name: 'Horizontal rule standardized',
      input: '***',
      expected: '---',
    },
  ],
};
