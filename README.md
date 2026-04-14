<picture>
  <source srcset="logo-white.svg" media="(prefers-color-scheme: dark)">
  <img src="logo-black.svg" width="50" height="50">
</picture>


Hollo eeruwang fork
===================

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template?repo=https://github.com/eeruwang/hollo)

A customized fork of [Hollo](https://github.com/fedify-dev/hollo), a federated
single-user microblogging software powered by [Fedify] and [ActivityPub].

This fork adds the following features on top of the original Hollo:

### eeruwang Theme
- Custom theme inspired by the [alignment.anthropic.com](https://alignment.anthropic.com) aesthetic
- Anthropic-inspired color palette (clay, ivory, oat)
- Left-aligned container layout with clean typography
- Post cards with hover border effects
- Selectable from the dashboard theme picker

### Dashboard Social Tab
- Compose and publish posts directly from the dashboard
- View recent posts timeline
- No need for a separate Mastodon client for basic posting

### Webhook Notifications
- Configure webhook URLs (Discord, Slack, etc.) from the dashboard
- Trigger on events: mention, reblog, follow, favourite, emoji reaction, poll, status

### Filter v2 API
- Mastodon-compatible content filtering (`/api/v2/filters`)
- Filter actions: warn, hide
- Keyword-based filtering with whole-word matching
- Filter contexts: home, notifications, public, thread, account

### Backup
- Archive backup (JSON or Markdown with embedded images)
- Full Hollo backup for migration (database + media)
- Accessible from the dashboard Backup tab

### Other
- Deploy on Railway button for one-click deployment

---

## Upstream

This fork is based on the original Hollo by [Fedify](https://fedify.dev/).

- Upstream repository: [fedify-dev/hollo](https://github.com/fedify-dev/hollo)
- Original docs: [docs.hollo.social](https://docs.hollo.social/)

[Fedify]: https://fedify.dev/
[ActivityPub]: https://www.w3.org/TR/activitypub/


Docs
----

 -  [What is Hollo?](https://docs.hollo.social/intro/)
 -  Installation
     -  [Deploy to Railway](https://docs.hollo.social/install/railway/)
     -  [Deploy using Docker](https://docs.hollo.social/install/docker/)
     -  [Manual installation](https://docs.hollo.social/install/manual/)
     -  [Environment variables](https://docs.hollo.social/install/env/)
     -  [Setting up](https://docs.hollo.social/install/setup/)
 -  [Tested clients](https://docs.hollo.social/clients/)
 -  [Search](https://docs.hollo.social/search/)
