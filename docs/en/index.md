---
layout: home

hero:
  name: techscout-protos
  text: Shared gRPC contracts
  tagline: Single source of truth for the gRPC contracts of the TechScout platform.
  actions:
    - theme: brand
      text: CI/CD flow
      link: /en/ci-flow
    - theme: alt
      text: Updating a proto
      link: /en/updating-protos
    - theme: alt
      text: Proto reference
      link: /en/proto-reference

features:
  - title: 3 contracts, 4 consumer repos
    details: techscout/{product,recommend,docs}/v1/*.proto — shared by gateway, product-service, rag-recommend, rag-docs via git submodule.
  - title: buf lint + breaking-change guard
    details: Every PR/push to main is checked by buf for style and backward compatibility before anything is fanned out.
  - title: Auto fan-out by changed file
    details: Only the services that actually consume the changed .proto file receive a repository_dispatch to sync — no blanket bump.
  - title: Docs never touch a service
    details: Changes under docs/ only build & deploy this GitHub Pages site — they never trigger buf lint or a dispatch to any service.
---

## What is this repo?

`techscout-protos` is the **single place** where every `.proto` for the TechScout
platform is defined. Services (gateway, product-service, rag-recommend, rag-docs)
do not keep their own copy of the protos — they attach this repo as a **git
submodule** and generate gRPC stubs from it.

If you need to:

- Understand how the **CI/CD flow** reacts when a proto changes → see [CI/CD flow](/en/ci-flow)
- Learn the **steps** to safely edit/add a proto → see [Updating a proto](/en/updating-protos)
- Look up what each **service/message** in the 3 proto files means → see [Proto reference](/en/proto-reference)
- **Set up** your local environment (buf, protoc, submodule, running the docs) → see [Setup](/en/setup)

::: tip Language
This site also has a [Vietnamese](/) version — use the language switcher in the top-right corner.
:::
