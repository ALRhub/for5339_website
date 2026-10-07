---
code: F
title: Management and Quantification of Maturity Improvement
verb: Measure
tagline: Measures of maturity
short: Maturity and knowledge
order: 7
field: Overarching approach for the fast AI-based maturation of immature processes
host: Vision and Fusion Laboratory (IES), KIT
pis: [kaefer, beyerer, pfrommer]
summary: F defines measures of process maturity and records the demonstrator's data and their provenance in a knowledge graph.
illustration:
  name: f
  label: Animation of a knowledge graph linking forming runs with material, machine, part and 3D-scan symbols. A green model learns from the scans as a schematic maturity gauge rises.
  caption: Illustration. Each forming run is linked to its material, machines, part and 3D scan. Models learn from the collected evidence, and the schematic maturity gauge rises.
workPackages:
  - code: "F.1"
    title: "Formal process maturity measure"
    text: "Elucidability, Forcability and Supervisability translate observability, controllability and quality tolerance into probabilistic maturity measures. Forcability was made computable as a stochastic reach-avoid problem, solved with approximate dynamic programming and estimated by Monte Carlo simulation on an electric arc furnace example. Supervisability and Elucidability exist so far in simplified form."
    papers: [arabizadeh2025maturity]
    figure:
      src: "../../assets/figures/f-1-maturity-measures.png"
      alt: "Diagram of a production process under uncertainty with controller, measurement and final product quality, linked to the three maturity measures Forcability, Elucidability and Supervisability."
      caption: "The three maturity measures around a production process under uncertainty. Forcability concerns steering into a target set, Elucidability state estimation from observations, and Supervisability the satisfaction of quality tolerances."
      credit: "KI-FOR 5339"
  - code: "F.2"
    title: "Virtual Process Dossier (VPD)"
    text: "The VPD is a process-aware data catalogue that adds a knowledge-graph layer above the raw data and captures prospective and retrospective workflow provenance, with a schema that reuses DCAT, PROV, SOSA/SSN, QUDT and WiLD. A provenance-capturing framework and a web interface were implemented, and the example process was modelled in the VPD. The publication is under review."
    papers: [kubelka2026vpd, harth2024tgdk]
    figure:
      src: "../../assets/figures/f-2-vpd.png"
      alt: "Diagram of the research data infrastructure, with the VPD user interface, the VPD ontology and framework, and a knowledge graph above the source data and the manufacturing environment."
      caption: "High-level overview of the knowledge-graph-based FAIR research data infrastructure."
      credit: "KI-FOR 5339"
  - code: "F.3"
    title: "Hybrid semantic-qualitative-numerical question answering"
    text: "RDFdL integrates RDF with differential dynamic logic, verifies transitions with KeYmaera X and returns the verified results as queryable RDF. Graph-based retrieval-augmented generation was evaluated on airport data, a shape-based SPARQL generator placed among the top three in several sub-challenges of the Text2SPARQL challenge at ESWC 2025, and a bounded LLM decision layer improved a fixed baseline in 200 simulated scenarios of a composite-forming workflow (CASE 2026)."
    papers: [li2025rag, wardenga2025text2sparql, li2026case]
    figure:
      src: "../../assets/figures/f-3-rdfdl.png"
      alt: "RDFdL overview. Metadata and simulation models are stored as RDF, translated into a differential dynamic logic model, proven with KeYmaera X, and the verified safety properties are returned to the RDF store for SPARQL queries."
      caption: "RDFdL system overview."
      credit: "KI-FOR 5339"
---

F spans all subprojects.
It defines when a process counts as mature, and its Virtual Process Dossier records experiments, simulations and decisions with their provenance.
