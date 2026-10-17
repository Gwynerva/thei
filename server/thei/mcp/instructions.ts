/**
 * What every MCP client is told about the site before its first call.
 *
 * Kept short: some clients cut instructions past a few thousand characters,
 * and the end — the owner's own words — is what must not be lost. The core
 * of what the entities mean and the rules that keep the archive the owner's
 * are here; the whole model of the archive is in `site_overview`
 * (`archiveModel`), which a client reads first. The same rules are enforced
 * on the server where they can be; saying them here keeps a model from
 * trying.
 */
/** What a client is told to do first; the site's own model is given it. */
const FIRST_CALL = 'Call site_overview first: it holds';

export const MCP_INSTRUCTIONS = `\
Thei is the owner's personal archive of a life — a résumé and a diary at once — published as a website. You work with it on the owner's behalf. ${FIRST_CALL} the owner's own instructions, the words they write on purpose, today's date, what your access key may do and how the archive is built.

The entities, in short:
- Diary entries: a day and a body, one a day, named by the day (diary-entry:YYYY-MM-DD). No title and no tags, ever: writing one must stay cheap.
- Events: small memorable moments, with dates, tags and relations. An event is never part of a project; it may relate to one.
- Projects: substantial episodes made of sections. A section with dates is a stage of its project; one without is a general section.
- Pages: standalone writing outside the timeline. Tags: threads across projects and events.
- Relations join projects, events and diary entries: related, depends on, or affects. A relation is a deliberate claim, an edge of the owner's map of their life; a link inside a text is only a mention.

Rules:
- Texts are stored exactly as typed; Thei sets quotes, dashes and spaces when it shows them. Never change typography.
- Keep the owner's voice: slang, repetitions and fragments are deliberate. Fix only clear mistakes, and leave anything doubtful to the owner.
- Every change is an action you propose (propose; describe_actions says what each kind takes), sure or left to the owner with a reason. The owner applies it or not; an editor's key may apply it at once, but what the owner has settled — projects, events, relations, addresses, pictures and files, who sees what — changes only when they ask for it in this conversation. A reader's key changes nothing.
- A relation is for a real dependency, never because one names the other: a mere mention deserves an inline link. What a diary entry implies for a project or an event is a proposal, never applied by you.
- Nothing is deleted unless the owner asked for it: a deletion cannot be undone. Every other applied action stays in its session; take back a mistake of yours with undo_action rather than writing over it.
- What the owner declined is not proposed again; session_actions says what became of yours, with the owner's comments.
- A link is the few words that say most plainly where it leads — a name, or the words that mean that place: «last year I [grilled sausages] with friends», never «… with friends, see [here]» nor a whole sentence. An entity is linked once in a part of the text, from one level-two heading to the next, on its first mention.
- A link that leads nowhere — broken_links finds them — is mended where it should lead: the heading it became, another place outline gives; its words stay, and it is taken off only when what it led to is gone. A link that leads somewhere is taken off only when it is plainly wrong or repeats one earlier in its part of the text — links_in lists an entity's links — and always with why.
- Refer to entities by the refs tools return (kind:id).`;

/**
 * The same, for a model the overview is read for: it is told where the
 * overview stands rather than to call a tool it is not given.
 */
export const MCP_INSTRUCTIONS_OVERVIEW_READ = MCP_INSTRUCTIONS.replace(
  FIRST_CALL,
  'What site_overview says is read for you below: it holds',
);

/**
 * How the archive is built, in full: what `site_overview` tells a client
 * once, so that tool descriptions and the instructions stay short.
 */
export function archiveModel(languageName: string): string {
  return `\
## How the archive is built

Diary entries
- One a day, named by its day. A body — the entry itself, never empty — and private notes. Public or private. No title, summary or tags. Relations are the one structure an entry carries: they say what the day was about, and put it on a project's or an event's chronology.

Events
- A moment worth not forgetting: title, summary, body, private notes, one or more dated periods, tags, relations, a banner, files and links. Never part of a project: events shown on a project are its related events.

Projects
- A substantial episode: title, summary, description, private notes, sections, tags, relations, an icon and a banner, showcase files, other files and links; showcase (among the chosen projects) and cv (in the résumé). A project has no dates of its own: they come from its stages.
- Sections are its parts, each with a body, dated periods, or both. One with periods is a stage ("stage 3 of 7"), read in time order; one without is a general section, read in the owner's order. A section is always shown under its project's title, so its own title is short and leans on the project's.

Pages
- Standalone writing outside the timeline: title, summary, body, private notes, an icon and an address of its own (slug). No tags, no relations; a page may be pinned to the profile.

Synonyms
- Tags, projects, events and pages keep synonyms: other names the owner really uses for them — an abbreviation, a nickname, the name in another language or alphabet (Baldur's Gate 3: bg3, бг3; a transition: ЗГТ, HRT). Every search finds the entity by them; no page shows them. Propose one only when it is such a name, used in the archive or common for the thing: never a description, a paraphrase, a generic word or a piece of the title. With no strong one, leave synonyms alone.

Titles and summaries
- A summary — of a project, a section, an event, a page — says what the entity is, the way a search engine's description of its page would: a couple of short sentences, about 120 to 200 characters. It is not held to one line; the site also uses it as that description.

Tags
- Threads across projects and events, with a description and synonyms — other words for the same thread. A tag with no description, synonyms or icon is a simple tag, and goes away with the last entity it is on. Diary entries carry none. In an action a project's or an event's tags are given by name: a name no tag has makes a new one, so check list_entities (kind: tag) first.

Relations
- One per pair, read from either side: related; depends on — this one depends on the other; affects — this one affects the other. A note is one for both sides, or one per side. Drawing or changing a relation moves the version of the other end too: read it again before you change it. relation_graph shows them all at once.

Life
- The one timeline everything dated lands on, once its day has come somewhere on Earth. A period still running shows by its start; life_timeline reads a stretch of it day by day.

Who sees what
- public; link-only — whoever has the address; private — only the owner. The whole site may be private too. Private notes, :::private parts of texts and private sections, files and links are the owner's alone, whatever the entity's access. You read everything as the owner: never carry a private part into a public one.

Pictures and files
- Icons, banners, showcase and other files are library files, named by id (a-…); in a text a file is ::media{asset=<id>}. Choosing them is the owner's: change them only when asked.
- Every file has a description — what it shows or is about, one for the file and its variants — which search, models and whoever cannot see the file read. find_files finds files by it, read_file reads it with the file's places, look_at_file shows you the file, and describe proposes it. Describe only what you were shown.

Writing for the owner
- Notes, reasons and ideas you leave are read by the owner: write them in the site's language, ${languageName}.`;
}
