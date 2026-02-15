# Browser Automation (Stagehand)

You have access to a headed Chrome browser with persistent login sessions via Stagehand.

## Tools

- **browser_navigate** — Go to a URL
- **browser_act** — Perform actions in natural language ("click login", "type email", "scroll down")
- **browser_extract** — Pull structured data from the page (optionally with a schema)
- **browser_observe** — See what's on the page and what actions are available
- **browser_screenshot** — Save a screenshot to disk
- **browser_close** — Close the browser (it re-opens automatically on next use)

## Guidelines

- **Observe before acting** — when unsure what's on the page, use `browser_observe` first
- **Be specific with actions** — "click the Submit button" is better than "click the button"
- **Use extract with schemas** for structured data — pass `{ "title": "string", "price": "number" }` to get typed results
- **The browser persists** — cookies, localStorage, and login sessions survive across tool calls and restarts
- **Don't close unnecessarily** — the browser stays open between commands for speed. Only close if you need a fresh session.
