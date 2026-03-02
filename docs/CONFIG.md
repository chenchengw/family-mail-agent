# Configuration Guide

The agent configuration lives in `config/agent.yml`.

## Timezone

```yaml
timezone: America/Los_Angeles
```

All event times in ICS files use this timezone. Use any valid IANA timezone identifier.

## Parent Notification

```yaml
parents:
  notify_to:
    - parentA@example.com
    - parentB@example.com
```

These addresses receive the daily digest email. Can be overridden by `PARENT_A_EMAIL` and `PARENT_B_EMAIL` environment variables.

## Sender Allowlist

Only emails from these senders/domains are processed. All others are silently skipped.

### Exact sender addresses

```yaml
email:
  allowed_senders:
    - teacher@lincoln-elementary.edu
    - coach.smith@soccerclub.org
    - admin@dancestudio.com
```

Matched against the `From` header (case-insensitive).

### Domain-level allowlist

```yaml
email:
  allowed_domains:
    - lincoln-elementary.edu
    - soccerclub.org
```

Any sender from these domains is allowed.

## Sender Profiles

Sender profiles provide default context to the LLM so it can better classify emails. Key by exact email address or `@domain` for domain-wide defaults.

```yaml
sender_profiles:
  "teacher@lincoln-elementary.edu":
    child: Alice
    activity: School
    keywords:
      - homework
      - field trip
      - parent-teacher conference

  "@soccerclub.org":
    child: Bob
    activity: Soccer
    keywords:
      - practice
      - game
      - tournament
      - picture day

  "admin@dancestudio.com":
    child: Alice
    activity: Dance
    keywords:
      - recital
      - class
      - costume
```

### Profile fields

| Field | Description |
|-------|-------------|
| `child` | Default child name associated with this sender |
| `activity` | Default activity name (e.g., "Soccer", "Piano") |
| `keywords` | List of keywords that help the LLM classify the email |

When a sender profile exists, the LLM prompt includes the child and activity as context, improving classification accuracy.

### Matching priority

1. Exact email address match (e.g., `teacher@school.edu`)
2. Domain match (e.g., `@school.edu`)
3. No match — LLM must infer from email content alone
