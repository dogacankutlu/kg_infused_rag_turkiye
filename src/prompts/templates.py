"""Centralized prompt templates for the KG-Infused RAG pipeline."""


TRIPLE_SELECTION_SYSTEM = (
    "You are a knowledge-graph reasoner helping with multi-hop question answering. "
    "Given a question and candidate <subject | relation | object> triples, select "
    "ALL triples that are potentially relevant — including triples that name a person, "
    "place, date, year, organization, or event that COULD be part of the answer path. "
    "Be inclusive: when unsure, include the triple. "
    "Respond with the indices of selected triples, comma-separated (e.g. '0,3,7'). "
    "Only respond with NONE if no triple has any conceivable connection to the question. "
    "Do not add explanations."
)


def triple_selection_prompt(question: str, triples_block: str) -> str:
    return (
        f"Question: {question}\n\n"
        f"Candidate triples:\n{triples_block}\n\n"
        "Useful triple indices:"
    )


SUBGRAPH_SUMMARY_SYSTEM = (
    "You are a Turkish-language summarizer for a question-answering system. "
    "Given a question and knowledge-graph facts, write ONE short paragraph in Turkish "
    "that directly tries to answer the question using only the provided facts and descriptions. "
    "Rules: "
    "(1) Lead with the answer if the facts support it. "
    "(2) Include only information that is relevant to answering the question — skip unrelated entities. "
    "(3) If multiple entities are found but only one matches the question (e.g. 'first', 'oldest', 'directed by'), "
    "name only that one and explain why. "
    "(4) If the facts do not contain enough information to answer, say so in one sentence. "
    "(5) Never list all related entities just because they exist — be selective and concise. "
    "Maximum 3 sentences."
)


def subgraph_summary_prompt(question: str, facts_block: str, descriptions_block: str = "") -> str:
    desc_section = (
        f"\nİlgili varlık açıklamaları:\n{descriptions_block}\n" if descriptions_block else ""
    )
    return (
        f"Soru: {question}\n\n"
        f"Bilgi grafiği olguları:\n{facts_block}\n"
        f"{desc_section}\n"
        "Yukarıdaki bilgileri kullanarak YALNIZCA soruyu cevaplamaya yönelik kısa bir Türkçe özet yaz. "
        "Soruyla ilgisi olmayan varlıkları listeleme. "
        "Tarih, yıl veya sayısal bir değer soruluyorsa, açıklamalarda bulursan mutlaka belirt. "
        "En fazla 3 cümle. Özet:"
    )


QUERY_EXPANSION_SYSTEM = (
    "You generate one short Turkish search query that complements an original "
    "question by using information from a knowledge-graph summary. Return only "
    "the new query — no quotes, no explanation."
)


def query_expansion_prompt(question: str, kg_summary: str) -> str:
    return (
        f"Orijinal soru: {question}\n\n"
        f"Bilgi grafiği özeti: {kg_summary}\n\n"
        "Orijinal sorudan farklı ama onunla ilgili yeni bir Türkçe arama sorgusu üret. "
        "Sadece yeni sorguyu yaz:"
    )


PASSAGE_NOTE_SYSTEM = (
    "You distill retrieved passages into a focused note that captures ONLY "
    "information relevant to the question. Write in Turkish. Be concise."
)


def passage_note_prompt(question: str, passages_block: str) -> str:
    return (
        f"Soru: {question}\n\n"
        f"Alınan pasajlar:\n{passages_block}\n\n"
        "Yukarıdaki pasajlardan sadece soruyla ilgili olan bilgiyi Türkçe olarak özetle:"
    )


AUGMENT_NOTE_SYSTEM = (
    "You enhance a passage note by incorporating accurate facts from a knowledge-"
    "graph summary. Never invent facts. Write in Turkish."
)


def augment_note_prompt(question: str, passage_note: str, kg_summary: str) -> str:
    return (
        f"Soru: {question}\n\n"
        f"Pasaj notu: {passage_note}\n\n"
        f"Bilgi grafiği özeti: {kg_summary}\n\n"
        "Pasaj notunu, bilgi grafiği olgularını da ekleyerek geliştir. "
        "Sadece geliştirilmiş notu yaz:"
    )


ANSWER_SYSTEM = (
    "You answer multi-hop factual questions about Türkiye in Turkish using ONLY "
    "the provided note. Give the shortest precise answer (usually a name, place, "
    "or entity). Do not add explanations or punctuation beyond the answer itself."
)


def answer_prompt(question: str, enhanced_note: str) -> str:
    return (
        f"Not:\n{enhanced_note}\n\n"
        f"Soru: {question}\n\n"
        "Cevap:"
    )
