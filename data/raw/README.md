---
license: mit
---

# Wikidata5M-KG

Wikidata5M-KG is an **open-domain** knowledge graph constructed from Wikipedia and Wikidata. It contains approximately **4.6 million entities** and **21 million triples**. Wikidata5M-KG is built based on the [Wikidata5M](https://deepgraphlearning.github.io/project/wikidata5m) dataset.

## 📦 Contents

### `wikidata5m_kg.tar.gz`

This is the processed knowledge graph used in our experiments. It contains:

- **4,665,331 entities**
- **810 relations**
- **20,987,217 triples**

After extraction, it yields a single file: `wikidata5m_kg.jsonl`, each line is a JSON object representing an entity with its metadata and one-hop neighborhood. Example:

```json
{
  "entity_id": "Q10417481",                          // Unique entity ID
  "entity_description": "Arethaea polingi, or Poling's thread-legged katydid, is a species of phaneropterine katydid in the family Tettigoniidae. It is found in North America.",       // Description of an entity
  "entity_alias": ["Arethaea polingi", "arethaea polingi"],  // Aliases of an entity
  "all_one_hop_triples_str": [                       // One-hop outgoing triples (relation, tail entity)
    ["parent taxon", "Arethaea"],
    ["instance of", "Taxxon"],
    ["taxon rank", "cohesion species"]
  ]
}
```

### `wikidata5m_raw_data.tar.gz`

This archive contains the original raw files used to construct `wikidata5m_kg.jsonl`.  
The data is derived from the Wikidata5M dataset. For detailed descriptions of the files and their meanings, please refer to the [original project documentation](https://deepgraphlearning.github.io/project/wikidata5m).

## 🔗 References

- 📘 Paper: [KG-Infused RAG](https://arxiv.org/abs/2506.09542) 
- 💻 Code: [GitHub Repository](https://github.com/thunlp/KG-Infused-RAG)

## 📄 Citation

If you find this knowledge graph useful, please cite:

```bibtex
@article{wu2025kg,
  title={KG-Infused RAG: Augmenting Corpus-Based RAG with External Knowledge Graphs},
  author={Wu, Dingjun and Yan, Yukun and Liu, Zhenghao and Liu, Zhiyuan and Sun, Maosong},
  journal={arXiv preprint arXiv:2506.09542},
  year={2025}
}