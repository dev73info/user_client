# user-client

[![73Info](https://img.shields.io/badge/Platform-73Info_%E6%9F%92%E5%8F%82%E4%BF%A1%E6%81%AF-1a237e?style=flat)](https://73info.cn)

This template should help get you started developing with Vue 3 in Vite.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Type Support for `.vue` Imports in TS

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) to make the TypeScript language service aware of `.vue` types.

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
pnpm install
```

### Compile and Hot-Reload for Development

```sh
pnpm dev
```

### Optional Development Auto Login

Copy `.env.local.example` to `.env.local` and set both values to enable local
auto-login during `pnpm dev`:

```sh
VITE_DEV_AUTO_LOGIN_USERNAME=
VITE_DEV_AUTO_LOGIN_PASSWORD=
```

Leave either value empty to disable auto-login. Use only disposable development
accounts; `.env.local` is ignored by git.

### Type-Check, Compile and Minify for Production

```sh
pnpm build
```

### OpenResty / Nginx History Fallback

Production uses Vue Router history mode, so the web server must return `index.html`
for non-file routes such as `/community` or `/free-resources`.

Use `deploy/openresty/73info-user-client.conf` as the OpenResty server-block
template. The essential rule is:

```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

`public/404.html` is also shipped as a last-resort browser redirect fallback, but
the OpenResty `try_files` rule is the correct fix for crawlers and refreshes.
If the same OpenResty virtual host also proxies `/api/` or `/uploads/`, keep
those `location` blocks above `location /`.

If refreshing a non-home route returns to the home page, the active OpenResty
site config is still missing the `location /` rule above; `error_page 404
/404.html` alone is only a fallback and should not be the main routing path.

### Run Unit Tests with [Vitest](https://vitest.dev/)

```sh
pnpm test:unit
```

### Run End-to-End Tests with [Playwright](https://playwright.dev)

```sh
# Install browsers for the first run
npx playwright install

# When testing on CI, must build the project first
pnpm build

# Runs the end-to-end tests
pnpm test:e2e
# Runs the tests only on Chromium
pnpm test:e2e --project=chromium
# Runs the tests of a specific file
pnpm test:e2e tests/example.spec.ts
# Runs the tests in debug mode
pnpm test:e2e --debug
```

### Lint with [ESLint](https://eslint.org/)

```sh
pnpm lint
```

---

<div align="center">

🌐 **[73Info 柒叁信息](https://73info.cn)** — 开发者资源发现 · 需求对接 · 定制协作平台

*73Info 前端用户客户端，基于 Vue 3 + Vite + TypeScript 构建。*

</div>
