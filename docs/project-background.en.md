# Language Miner Project Background

[한국어](project-background.ko.md) · [Main introduction](../README.en.md)

Language Miner did not begin as a public service. It began as a personal tool for turning expressions found while reading and listening into cards, reviewing them, and trying to use them again in real sentences.

## From a personal tool to open source

As the tool grew, it became clear that other learners face the same gap. News about OpenAI support for open-source contributors was one of the prompts that made releasing the source worth serious consideration. This is not a claim that the project received a benefit, and it is not a sponsorship relationship that controls the project’s terms or direction.

Choosing to publish meant abandoning the standard of “it works on my computer.” Personal settings, API keys, local paths, experimental logs, and assets without clear rights had to be separated. A person with no project history needed a safe path through the app.

## Why sentence cards

The starting problem was familiar: a learner can study a vocabulary list for a long time and still fail to produce a sentence in conversation. Recognizing a definition and retrieving a natural sentence in a situation are not the same memory.

Language Miner therefore centers this connection:

```text
Find an expression → make a sentence card → spaced review → use it in writing or conversation
```

The point is not to stop at reading and listening, but to retrieve the same expression through speaking and writing.

## Why the project expanded into UGC

Character Chat began as a way to use learned sentences in a situation. PlayZone lets learners spend local study rewards in small games, adding motivation to keep studying and a place for creators to participate. It is not an in-game language-learning mode.

A growing UGC community does not require one web service to own every file. Creators can keep content in their own GitHub Releases or other storage, while Discord supports discovery and conversation. The app applies the same technical checks to imported packs.

This structure allows a community to grow without a central server holding user content or a shared API key. It also requires an honest warning: a link alone cannot guarantee safety or copyright status.

## Local-first principles

- AI is disconnected on a new installation.
- Work locally with local data and models where practical.
- Enable cloud AI only with the user’s key and explicit transfer consent.
- Operate no developer advertising, analytics, or telemetry server.
- Check UGC file, permission, and provenance contracts before execution.

Local-first does not mean risk-free. Plaintext local data can be exposed to someone with Windows account access or malware, and a remote Ollama URL is still an external transfer. Helping users understand the actual boundary is part of the product.

## First public beta scope

The first goal is not the largest feature list. It is to release the visible learning loop safely and understandably.

- Windows 10/11 x64 installer and portable build;
- Korean and English UI;
- local-first cards, review, input, and output practice;
- optional AI with cost and transfer guidance;
- full backup and restore;
- validated character and game UGC;
- static GitHub Pages documentation and open development.

Anki and CSV export, a UGC catalog, Chrome Web Store distribution, automatic update, macOS, Japanese and Chinese UI, and a full web app remain post-beta candidates to reassess using real usage.

## What the project aims to be

Language Miner should not force one study method on everyone. It aims to give learners a foundation for collecting their own sentences, reviewing at their own pace, understanding safety boundaries, reusing expressions in conversation, and spending study rewards in play. For creators, it aims to offer an open format for building characters and games and managing versions and licenses without needing permission from a central service.
