<div align="center">

# 🤖 Plazero

### A Discord bot for meme communities, built as a pure [Effect](https://effect.website) application

*Meme contests · community-driven moderation · member onboarding · the weekly corabastos*

[![TypeScript](https://img.shields.io/badge/TypeScript-7.0_native-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Effect](https://img.shields.io/badge/⚡_Effect-4.0_beta-black)](https://effect.website)
[![discord.js](https://img.shields.io/badge/discord.js-14-5865F2?logo=discord&logoColor=white)](https://discord.js.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Biome](https://img.shields.io/badge/lint%20%2B%20format-Biome-60A5FA?logo=biome&logoColor=white)](https://biomejs.dev)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-339933?logo=node.js&logoColor=white)](https://nodejs.org)

</div>

---

## What it does

| | Feature | In one line |
|---|---|---|
| 🗳️ | **Vote** | Democratic timeouts: the community votes with 👍/👎, escalating sanctions apply automatically |
| 🤣 | **Meme** | Friday-to-Friday meme & 🦴 contests tracked by laugh reactions, with yearly hall of fame |
| 👋 | **Welcome** | Onboards new members, collects LinkedIn/presentation info, moderator approval flow |
| 🇨🇴 | **Corabastos** | Weekly community session: agenda with *turnos*, emergency sessions, DM reminders |
| 👻 | **Departure** | Notifies admins when a member leaves |

Every feature is a **vertical slice** under `src/features/<name>/` — its domain model, services, Discord handlers, embeds, and slash commands live together, wired to the app through one exported [Layer](https://effect.website/docs/requirements-management/layers/).

---

## Architecture

The whole application is one dependency graph of Effect layers, composed **once** in [`src/main.ts`](src/main.ts). This diagram isn't aspirational documentation — it's the actual `MainLive` composition, and the compiler rejects the build if an edge is missing:

```mermaid
flowchart TD
    subgraph runtime["🎬 Entry — NodeRuntime.runMain(Layer.launch(MainLive))"]
        GATEWAY["GatewayLive<br/><i>discord/Gateway.ts</i><br/>7 gateway listeners → FiberSet"]
        JOBS["ScheduledJobsLive<br/><i>jobs/ScheduledJobs.ts</i><br/>6 recurring fibers"]
    end

    subgraph features["🧩 Features — each facade hides its repository"]
        VOTE["VoteFeatureLive<br/>VoteManager ⊂ VoteRepository"]
        MEME["MemeFeatureLive<br/>MemeManager ⊂ MemeRepository"]
        WELCOME["WelcomeFeatureLive<br/>WelcomeManager ⊂ WelcomeRepository"]
        CORA["CorabastosFeatureLive<br/>CorabastosManager ⊂ CorabastosRepository"]
    end

    subgraph shared["🤝 Shared domain"]
        USER["UserRepository.layer<br/><i>domain/UserRepository.ts</i>"]
    end

    subgraph infra["⚙️ Infrastructure"]
        DISCORD["DiscordClient.layer<br/>login ⇢ ready ⇢ destroy on release"]
        BOOT["Migrations.boot<br/>runs pending migrations<br/><b>gates the Discord login</b>"]
        MIG["Migrations.layer"]
        PG["PgLive<br/>PgClient / SqlClient pool"]
        NODE["NodeServices.layer<br/>fs · path · runtime"]
    end

    CONFIG[("DotEnvConfigProviderLive<br/>.env ⇢ ConfigProvider")]

    GATEWAY --> VOTE & MEME & WELCOME & CORA
    JOBS --> VOTE & MEME & CORA
    GATEWAY --> DISCORD
    VOTE & MEME & WELCOME & CORA --> USER
    MEME & CORA --> DISCORD
    BOOT -. "must finish first" .-> DISCORD
    BOOT --> MIG
    USER --> PG
    VOTE & MEME & WELCOME & CORA --> PG
    JOBS --> PG
    MIG --> PG
    MIG --> NODE
    PG --> CONFIG
    DISCORD --> CONFIG

    classDef entry stroke:#e74c3c,stroke-width:2px
    classDef feat stroke:#8e44ad,stroke-width:2px
    classDef infra stroke:#2980b9,stroke-width:2px
    classDef cfg stroke:#f39c12,stroke-width:2px
    class GATEWAY,JOBS entry
    class VOTE,MEME,WELCOME,CORA feat
    class DISCORD,BOOT,MIG,PG,NODE,USER infra
    class CONFIG cfg
```

Three properties fall out of this graph:

1. **Startup ordering is declarative** — `DiscordClient.layer.pipe(Layer.provide(Migrations.boot))` means the bot *cannot* log in before the schema is migrated. No init function, no ordering bugs.
2. **Repositories are private** — each facade does `Manager.layer.pipe(Layer.provide(Repository.layer))`, so a handler physically cannot reach another feature's tables.
3. **Shutdown is free** — `Layer.launch` holds the scope open; on SIGINT the finalizers run in reverse order (stats logged → Discord client destroyed → pg pool closed).

## Life of an interaction

```mermaid
sequenceDiagram
    autonumber
    actor U as Member
    participant D as Discord Gateway
    participant G as Gateway.ts<br/>(FiberSet runtime)
    participant H as VoteCommands.ts<br/>(Effect.fn handler)
    participant M as VoteManager
    participant R as VoteRepository
    participant P as PostgreSQL

    U->>D: /vote-timeout @user reason
    D->>G: InteractionCreate
    G->>G: runFork(safeInteraction) — a supervised fiber per event
    G->>H: dispatch by command name<br/>(same constant used at registration)
    H->>M: yield* VoteManager
    M->>R: createVote(...)
    R->>P: sql`INSERT ...` → Schema.decode(VoteRow)
    P-->>U: 📊 vote embed + 👍 👎 reactions
    Note over H,M: Failures are values: DiscordError / tagged domain errors<br/>caught with catchTag, rendered as Spanish embeds.<br/>Anything unexpected → catchCause → log + apology reply
```

Every discord.js promise crosses into Effect through one four-line helper — `discordCall(operation, thunk)` — so there is **no floating promise anywhere** and every Discord failure is a typed `DiscordError` carrying the operation name.

## Boot sequence

```mermaid
flowchart LR
    A(["npm start"]) --> B["Load .env via<br/>ConfigProvider"]
    B --> C["Connect pg pool<br/>(verified with SELECT 1)"]
    C --> D["Migrations.boot<br/>apply pending SQL"]
    D --> E["Discord login<br/>+ wait for ClientReady"]
    E --> F["Register 7 gateway<br/>listeners + 6 job fibers"]
    F --> G(["🟢 Layer.launch<br/>runs forever"])
    G -. "SIGINT → finalizers<br/>in reverse order" .-> A
```

## Anatomy of a feature

Every feature follows the same shape (vote shown; the other four are isomorphic):

```
src/features/vote/
├── Vote.ts              ← the facade: exports VoteFeatureLive (only main.ts imports this)
├── VoteDomain.ts        ← model + constants + helpers (VoteData, thresholds, vote weight)
├── VoteManager.ts       ← business logic service   › static readonly layer
├── VoteRepository.ts    ← SQL + row schemas        › static readonly layer
├── VoteCommands.ts      ← slash handlers + the SlashCommandBuilder definitions
├── VoteReactions.ts     ← 👍/👎/⬜ reaction handlers
├── VoteCompletion.ts    ← the vote-resolution workflow (used by handlers *and* jobs)
├── VoteUpdates.ts       ← live embed refresh
├── VoteEmbeds.ts        ← pure EmbedBuilder functions — no Effect, no I/O
└── README.md            ← feature docs
```

The facade is deliberately boring — and that's the point:

```ts
// src/features/vote/Vote.ts
export const VoteFeatureLive = VoteManager.layer.pipe(Layer.provide(VoteRepository.layer));
```

### House rules

| Rule | What it looks like |
|---|---|
| Services are classes | `class VoteManager extends Context.Service<VoteManager>()('plazero/VoteManager', { make })` |
| Layers live on the class | `static readonly layer = Layer.effect(VoteManager)(VoteManager.make)` |
| Named ops are traced | `Effect.fn('VoteManager.getVote')(function* (id) { ... })` — spans for free |
| Errors are data | `class InvalidTurnoError extends Schema.TaggedErrorClass<...>()('InvalidTurnoError', { turno: Schema.Number })` |
| Rows are schemas | `sql\`SELECT ...\`` decoded with `Schema.Class` row models at the DB boundary |
| One promise bridge | `discordCall('interaction.reply', () => interaction.reply(...))` → typed `DiscordError` |
| No barrel files | Import the module you mean; the layer graph *is* the dependency documentation |
| Commands can't drift | `.setName(VOTE_TIMEOUT_COMMAND)` at registration **and** `case VOTE_TIMEOUT_COMMAND:` at dispatch — same constant |

## Background jobs

Six supervised fibers, started by `ScheduledJobsLive`, all in `America/Bogota`. A failing tick is logged and the schedule keeps running:

| Job | Schedule | Does |
|---|---|---|
| `voteSweep` | every 30 s | completes expired votes, refreshes live embeds |
| `contestCompletion` | `0 * * * *` (hourly) | closes finished meme contests, announces winners |
| `turnoNotifications` | `* * * * *` (every minute) | corabastos turno reminders (channel + DM) |
| `weeklySessionCreation` | `0 0 * * 6` (Sat 00:00) | schedules the week's corabastos session |
| `databaseCleanup` | every 1 h | runs `run_all_cleanup()` in Postgres |
| `corabastosCleanup` | every 30 min | expires stale emergency requests & notifications |

## Slash commands

| Command | Feature | Who |
|---|---|---|
| `/vote-timeout <user> <reason>` | 🗳️ vote | everyone with *One Of Us* |
| `/cancel-vote <vote-id>` | 🗳️ vote | admins |
| `/meme-of-the-year` | 🤣 meme | everyone |
| `/meme-stats` | 🤣 meme | everyone |
| `/meme-contest <type> [duration]` | 🤣 meme | moderators |
| `/meme-complete-contest <contest-id>` | 🤣 meme | admins |
| `/corabastos-agenda agregar <turno> <tema> [descripcion]` | 🇨🇴 corabastos | everyone |
| `/corabastos-agenda ver` | 🇨🇴 corabastos | everyone |
| `/corabastos-emergencia <razon> <paciente>` | 🇨🇴 corabastos | everyone |
| `/corabastos-estado` | 🇨🇴 corabastos | everyone |
| `/corabastos-crear-sesion` | 🇨🇴 corabastos | admins |

## Quickstart

```bash
npm install        # also vendors the Effect repo for reference (scripts/prepare-effect.sh)
npm run setup      # create the database + run all migrations
npm run dev        # migrate → register commands → run the bot with tsx
```

| Script | |
|---|---|
| `npm run dev` | full local loop (migrate, register, run) |
| `npm run build` | TypeScript 7 native compile — the whole app in ~0.5 s |
| `npm run lint` / `lint:fix` | Biome: lint + format + import order, one tool |
| `npm run migrate:status` | migration table vs. `src/migrations/*.sql` |
| `npm start` | production: build → migrate → register → run |

<details>
<summary><b>🔐 Environment variables</b></summary>

```env
DISCORD_BOT_TOKEN=your_bot_token
CLIENT_ID=your_client_id
GUILD_ID=your_server_id
DATABASE_URL=postgresql://user:password@localhost:5432/plazero_bot
# or individual PG* variables:
PGDATABASE=plazero_bot
PGUSER=postgres
POSTGRES_PASSWORD=your_password
```

Config is read through Effect's `ConfigProvider` (see `src/config/`): `.env` is layered on top of the process environment, secrets are `Config.redacted`, and legacy variable spellings are supported via `Config.orElse` chains.

</details>

<details>
<summary><b>🏗️ Required Discord setup — channels, roles, permissions, intents</b></summary>

**Channels**

| Channel | Used by |
|---|---|
| 🤣︱memes | meme contests |
| 🧑‍⚖️︱moderación | voting messages |
| 👋︱nuevos | welcome flow |
| 🗿︱general | corabastos announcements |
| 🇨🇴︱corabastos | the session voice channel |
| 🐵︱administración | departure notices |

**Roles** — *One Of Us* (vote + granted on welcome approval), *Server Booster* (2× vote weight), Administrator (vote-immune, can cancel).

**Permissions** — Send Messages, Use Slash Commands, Add Reactions, Read Message History, View Channels, Embed Links, **Timeout Members**, Manage Messages, Use External Emojis.

**Intents** (set in code) — `Guilds`, `GuildMessages`, `MessageContent`, `GuildMessageReactions`, `GuildMembers`.

</details>

<details>
<summary><b>🗄️ Database & migrations</b></summary>

Plain SQL migrations in [`src/migrations/`](src/migrations/) with `-- UP MIGRATION` / `-- DOWN MIGRATION` sections, applied by an Effect service (`db/Migrations.ts`) that keeps the production-compatible `migrations` bookkeeping table.

```bash
npm run migrate:up          # apply pending
npm run migrate:status      # show applied vs pending
npm run migrate:rollback 7  # roll back version 7
```

See [DB_SETUP](src/migrations/DB_SETUP.md) for details.

</details>

---

<div align="center">

**Stack** — TypeScript 7 (native compiler) · Effect 4 β · discord.js 14 · `@effect/sql-pg` · Biome · Node ≥ 22

MIT © laplazadevs

</div>
