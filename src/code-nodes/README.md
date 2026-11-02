# Code node sources

Readable copies of the JavaScript inside the n8n Code nodes, so the logic can be reviewed, diffed, and tested without opening n8n.

- `lib.js` holds the shared helpers (dates in Asia/Karachi, slot generation, calendar matching). It is prepended to the Code nodes marked below.
- The other files are the node-specific logic.
- The exported workflows in `workflows/` already contain `lib.js` plus the node logic, so you do not need to paste anything to use them.

| File | n8n workflow | n8n node | Includes lib.js |
|---|---|---|---|
| `check-prepare.js` | 1. Check availability | Prepare Request | yes |
| `check-find.js` | 1. Check availability | Find Slots | yes |
| `book-prepare.js` | 2. Book appointment | Prepare Request | yes |
| `book-check.js` | 2. Book appointment | Check Slot and Build | yes |
| `book-buildrow.js` | 2. Book appointment | Build Row | no |
| `cb-prepare.js` | 3. Request callback | Prepare Request | yes |
| `cb-buildrow.js` | 3. Request callback | Build Row | no |

To change a rule, edit the file here, run `node tests/logic/harness.js`, then paste `lib.js` followed by the file's content into the matching node. Keep the check and book logic consistent: both apply the same rules.
