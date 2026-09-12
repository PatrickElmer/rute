Rute.js is a lightweight, reactive single-page application router that combines hash-based routing with reactive data binding and localStorage persistence.

# Features

1. Automatic persistence: All bound data persists to localStorage per route
2. Two-way binding: Changes to inputs automatically update all bound elements
3. Computed properties: Real-time calculations that update when dependencies change
4. Hash-based routing: Simple navigation without page reloads
5. Scoped data: Each route maintains its own data state

# Rute.js

A tiny, dependency-free router and reactivity layer for plain HTML pages. No build step, no framework — just a `<rute>` element and a script tag.

Rute does two things:

1. **Routes** hash URLs (`#/page`) to HTML templates fetched from a folder.
2. **Binds** DOM elements to reactive values that persist in `localStorage`, scoped per route.

## Getting started

```html
<rute id="rute" default="index" dir="templates/" ext=".html"></rute>
<script src="https://cdn.jsdelivr.net/gh/PatrickElmer/rute@main/rute.js"></script>
```

On load, and on every `hashchange`, Rute reads the current hash, fetches the matching template, and swaps it into the `<rute>` element.

For example, with the config above, visiting `#/about` fetches `templates/about.html`. Visiting the site with no hash loads `templates/index.html` (the `default`).

## The `<rute>` element

| Attribute | Description | Default |
|---|---|---|
| `default` | Route used when there's no hash | `index` |
| `dir` | Folder templates are fetched from | `templates/` |
| `ext` | File extension appended to the route name | `.html` |
| `404` | Fallback HTML shown when a template fails to load | *(none)* |

If no `<rute>` element is found, Rute falls back to `#rute`, then `document.body`.

Templates can contain `<script>` tags — unlike setting `innerHTML`, Rute inserts content in a way that lets embedded scripts run.

## Reactive bindings — `data-bind`

Add `data-bind="name"` to any element to turn it into a live view of a value called `name`:

```html
<input data-bind="username" placeholder="Your name">
<p>Hello, <span data-bind="username"></span>!</p>
```

- Typing in the input updates `span`'s text immediately, and vice versa if you set the value elsewhere.
- The value is stored in `localStorage`, namespaced to the current route, so it survives page reloads.
- You can also read and write it from JavaScript as a plain global:

  ```js
  console.log(username)      // read
  username = 'Ada'           // write — updates every bound element
  ```

Inputs use their `value` property; other elements use `textContent`.

## Computed values — `data-compute`

Add `data-compute="name"` to an element whose text is a JavaScript expression. It's evaluated once on load, and automatically re-evaluated whenever a `data-bind` value it references changes:

```html
<input data-bind="price" value="10">
<input data-bind="qty" value="2">
<p>Total: <span data-compute="total">price * qty</span></p>
```

No manual wiring needed — Rute tracks which bound values each computed expression touches.

## How state is stored

Each bound value is saved under a route-scoped key:

```
rute_hash_<current-hash>_<name>
```

This means the same `data-bind="name"` on two different routes holds two independent values.

## Notes & limitations

- Routing depends on `fetch()`, which browsers block for local files opened via `file://`. Serve the folder over HTTP (e.g. `python3 -m http.server`) during development.
- `data-compute` expressions run through `eval`, so keep them simple and trusted.
- Bindings work best with scalar values (strings, numbers, booleans) — arrays and objects are stored fine but won't render usefully as text.
- There's no build step, virtual DOM, or component model — it's a small utility for simple, mostly-static multi-page sites that need a bit of shared reactive state.
