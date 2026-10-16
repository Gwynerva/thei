# AI in Thei

Thei can work with AI two ways, each optional and independent of the other:

- **An AI app works with the archive.** Claude, ChatGPT, Claude Code or any
  other app that speaks MCP reads the site as the owner sees it, proposes
  changes for the owner to apply — and, with Editor rights, applies them
  itself. The app pays for its model as it always does.
- **Thei's own model answers in sessions.** With an API key from a service
  the owner chooses, the owner talks to a model on the AI page, and
  templates run it on a schedule. It reads and proposes only. The owner pays
  that service, within a monthly limit.

All of it is off until the owner turns **AI in Thei** on, on the
**Connection** tab of the AI page. Off, `/api/mcp` and the sign-in addresses
answer 404, no key opens anything, and no page asks anything about AI.

Words, used one way each: an **access key** is what Thei gives an app; an
**API key** is what a model's service gives Thei; **tokens** are only what a
model spends.

The AI page has four tabs: **Sessions**, **Templates**, **Memory** and
**Connection**.

## Connecting an app

The **Connection** tab walks through it app by app. The MCP address is
`<site>/api/mcp`.

**By signing in** (OAuth 2.1). Claude (web, desktop and phone), ChatGPT and
Claude Code connect this way: give the app the address, and it opens a page of
the site where the owner, signed in, chooses its rights and allows it. The app
gets a connection — a key that lasts an hour and is renewed while it is used,
and ends after a month without use. An app known by the address of its own
description is shown as such; one that registered itself is shown as having
named itself.

```bash
claude mcp add --transport http thei https://example.com/api/mcp
```

Then `/mcp` in Claude Code, **Authenticate**.

Signing in needs HTTPS (or a site on `localhost`). A site served from a
subfolder, `https://example.com/diary/`, needs one redirect on its proxy,
because an app looks for the sign-in at the host's root with the path after it:

```
/.well-known/oauth-authorization-server/diary → /diary/.well-known/oauth-authorization-server
```

The connection check says whether apps find it.

**By an access key.** For an app that cannot sign in: create a key on the
**Connection** tab — it is shown once, only its hash is kept — and give the
app the address with the key as a bearer header:

```bash
claude mcp add --transport http thei https://example.com/api/mcp --header "Authorization: Bearer thei_…"
```

Keys and connections are listed together as chips, the most lately used
first; each opens a window with its latest sessions, a check of the
connection as that key, and revoking it, which ends it at once.

## Rights

| Rights | May                                                                                     |
| ------ | --------------------------------------------------------------------------------------- |
| Reader | Read everything as the owner sees it; propose actions; keep the model's digests.        |
| Editor | All a reader may, and apply actions as the owner would: create, change, upload, delete. |

Which change needs which right is decided in `server/thei/mcp/scope.ts`
only. An editor applies through the admin's own forms, with the version it
read, so a change over something changed since is refused rather than
written over it.

## Sessions

Everything a model does happens in a **session**: a conversation, the
actions proposed in it and what became of them. The owner starts one on the
**Sessions** tab, from the ✦ of an entity's form — about that entity — or
from the ✦ of the admin bar. An app opens one with `open_session`; one that
does not is given one per key and app name, a new one after half an hour of
quiet. A template's run is a session too.

A session waits for the owner while an action in it is undecided or a
question unanswered; the admin bar counts what waits. Archived by the owner,
or quiet for a week, a session goes to the archive, the last group of the
list; there it is only read until the owner brings it back, and an app may not
go on with one the owner archived: the files it still has on their way into
it are cancelled. A month in the archive and it is deleted, unless pinned,
leaving its summary.

The owner may bring files along with a message — from the «+» menu, pasted or
dropped, several at once — and an app's uploads, imports and re-encodings are
brought into its session the same way. Each goes into the library with its
place there, in the session, and goes a day after the session does unless
something else holds it. The model is shown pictures, PDFs and texts, and
told of every file by its name and id, so a text it proposes can take one in.

The site's model may make a file the owner asks for with `make_file` — any
kind, as its name says, written as text or as base64 — which joins the
session's files under its answer. A file is opened alone, with no files
beside it, so it is told to carry inside whatever it needs: a report is one
page with its styles, scripts and pictures in it. A table it answers with is
shown as one.

## Actions

A change a model wants is an **action**, of one of the kinds in
`shared/ai-actions.ts` — a field, periods, tags, a relation, who sees it, a
text written or edited, a new entity, a deletion, something remembered —
each with a reason, and sure or left to the owner. Several make a bundle,
checked whole and applied in order; an atomic one is undone whole when one
of its parts fails. A deletion is final and never proposed as sure.

The owner applies, declines or comments on each — a comment gets a new
version of it — in the session, or in the entity's form, where it waits at
the label of the field it changes, behind a ✦. Taken in the form, it is
applied when the form is saved. A declined one may be marked **never to be offered again**: it is
remembered, and the same proposal is not made again. An applied action can
be undone while what it changed reads as it left it.

An edit of a text is gone through part by part on its own screen — read as
it will be, word changes beside each other, or as a list — and the same
screen compares a text with a draft or a version from its history.

## Memory

What a model should know is kept anchored to what it is about, and read
only together with it: **about you**, read in every session; an entity; a
pair of entities; every entity of a kind; and the **dictionary** — names,
places and the owner's own words, with a note and their forms, which
proofreading leaves as written. The **Memory** tab lists all of it; an
entity's form shows its own, under **What the AI remembers**.

A model may also keep a **digest** of an entity: a few lines it reads
instead of the whole while the entity is unchanged.

## Templates

A **template** is a request that starts a session. Without a schedule it is
a ready-made request: the owner opens it as a new session with its words
written in, or from the ✦ of an entity of the kinds it is offered on, the
entity named already, and sends it as it is or added to. With a schedule — a
day, a week or a month at the owner's hour — it runs by itself, and waits
while the session of its last run still waits for the owner: answering, or
holding actions or a question not decided, and not archived. So a template
piles up no sessions while the owner is away, and one run once they are back
reads everything since.

The built-in ones are written in the code, and the owner chooses only when
they run and with which model; the owner's own are written by the owner. A
model takes from the request what to read, and may ask for what changed
since the template last ran (`changes_since`). The schedule is kept in the
database; a run missed while the site was down happens once when it is back.
The built-in **Broken links** goes through `broken_links` and mends each
link with `revise`, mode `relink`: the heading a renamed one became, another
place `outline` gives, and only when what it led to is gone, the words
without the link.

## The model of the site

Set up on the **Connection** tab: a service from the list — or an address
of the owner's own, a model on their computer included — its API key, and
the model, chosen from the service's own list where it gives one. It works
through the site's own tools with a reader's rights, so it reads and
proposes only, and stops at the monthly limit; the key stays on the server.

The owner may stop it while it answers, and it stops for sure: what it wrote
stays, put right for the conversation to go on, and nothing it would still
do lands. It stops by itself when a turn runs past 15 minutes or its service
says nothing for two; a tool that takes more than a minute is given up on,
and the model told so. Turning AI off stops everything under way, and a turn
a restart cut off says so.

## Tools

| Tool                              | What it does                                                         |
| --------------------------------- | -------------------------------------------------------------------- |
| `site_overview`                   | The site, its kinds of entities, and what the owner asks of models.  |
| `search_archive`                  | Words across every text.                                             |
| `list_entities`                   | Entities of a kind, by dates too.                                    |
| `read_entity`                     | One entity whole, with its memory; `since` gives only what changed.  |
| `changes_since`                   | What changed in a span of time.                                      |
| `life_timeline`                   | The one timeline of everything dated.                                |
| `relation_graph`                  | The relations around an entity.                                      |
| `tag_candidates`                  | Entities a tag might belong on.                                      |
| `outline`                         | The headings and sections a link may lead to inside an entity.       |
| `broken_links`                    | Links leading nowhere now, with where each may lead instead.         |
| `read_memory`                     | What is remembered of an entity, a kind or the owner.                |
| `read_digests`, `write_digest`    | The model's own few lines about entities.                            |
| `open_session`, `session_actions` | A session to work in, and what became of its actions.                |
| `describe_actions`                | The kinds of actions, and what each takes.                           |
| `propose`                         | Actions for the owner; with `apply`, an editor applies them at once. |
| `undo_action`                     | Takes back an action applied.                                        |
| `upload_file`, `import_file`      | A file into the library, as the admin uploads one (editor).          |
| `reprocess_file`, `file_status`   | A new variant of a library file, and how its processing goes.        |
