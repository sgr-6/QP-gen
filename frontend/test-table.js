const MarkdownIt = require('markdown-it');
const md = new MarkdownIt();
const text = `| Process | Current allocation A B C D | Maximum need A B C D | Available A B C D |
|---|---|---|---|
| P0 | 0 0 1 2 | 0 0 1 2 | 1 5 2 0 |
| P1 | 1 0 0 0 | 1 7 5 0 | |
| P2 | 1 3 5 4 | 2 3 5 6 | |
| P3 | 0 6 3 2 | 0 6 5 2 | |
| P4 | 0 0 1 4 | 0 6 5 6 | |`;
console.log(md.render(text));
