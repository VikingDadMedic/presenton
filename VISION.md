# Vision

TripStory exists to give travel agents and BDMs a creative AI partner for visual destination storytelling -- turning a destination, dates, and a client brief into a polished, bookable presentation in minutes.

AI should not produce unstructured text blobs. It should generate structured, beautiful visual documents with layout, hierarchy, themes, and design systems built in from the start. For travel, that means itineraries, pricing tiers, accommodation cards, weather overviews, and booking CTAs -- all laid out professionally with real photography.

We don't make up hotels, prices, weather, or activities. The enrichment pipeline pulls real data from supply APIs (Viator, Tavily, Visual Crossing, Unsplash, Pexels, Google Maps) and lets the LLM write compelling narrative around verified facts. When an API key is missing, the enricher returns empty data and the LLM falls back gracefully. No enricher breaks the pipeline; they only make it better.

Visual asset generation must not require surrendering data to external platforms. It must run locally. It must work inside private networks. It must remain usable in controlled and air-gapped environments.

Users should be free to choose their models. Local models. Open models. Proprietary providers. Hybrid setups. Text models and image models working together. Systems such as Ollama or any compatible runtime. No lock-in.

Templates and designs are first-class citizens. Users can create them, modify them, package them, share them internally, and distribute them publicly. Themes and asset packs can be configured manually or generated with AI.

TripStory is an open-source travel presentation engine built on top of the [Presenton](https://github.com/presenton/presenton) document platform. It is infrastructure for AI-native visual workflows. Portable. Extensible. Model-agnostic. Private by default.

Beautiful travel proposals. Generated locally. Owned by the agent.
