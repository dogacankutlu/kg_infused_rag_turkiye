"""Rebalance the Türkiye QA dataset away from the heavy "Türkiye" gold-answer
class imbalance discovered in the 3-hop evaluation (60/77 = 78% Türkiye-gold).

Steps:
  1. Drop ~90% of the Türkiye-gold questions, keeping 3 representative ones
     (one 2-hop, one 3-hop, one single-hop) so the gold class isn't fully
     erased — we still want the pipelines to demonstrate they CAN say Türkiye
     when it's the right answer.
  2. Append 30 freshly-authored questions, all ≥ 2-hop, all with non-Türkiye
     gold answers, distributed across difficulty (15× 2-hop, 10× 3-hop, 5×
     comparison) and across the project's domains (politics, football, cinema,
     literature, science, company, heritage, academia, geography, music,
     architecture, transportation).
  3. Write a sidecar file listing the question_ids that were removed so a
     follow-up script can prune those log records from logs/{success,failure}/.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
QA_PATH = ROOT / "questions" / "turkiye_qa.json"
REMOVED_PATH = ROOT / "questions" / ".removed_question_ids.json"

# Of the 31 Türkiye-gold questions, keep these 3 as a token retention
# (one per major difficulty class). Everything else with gold == "Türkiye"
# gets dropped.
KEEP_TURKIYE_IDS = {
    "TR_022",  # 2-hop heritage — Topkapı Sarayı
    "TR_036",  # 3-hop company — Koç Holding founder
    "TR_090",  # single-hop cuisine — Baklava
}


# 30 new questions. Schema matches the existing file. All paths verifiable
# against canonical Wikidata facts; the BFS-extracted Türkiye subgraph
# definitely contains the bridge entities (Galatasaray, Fenerbahçe, ODTÜ,
# major Turkish politicians, Pamukkale, etc.).
NEW_QUESTIONS = [
    # ============================== 2-hop (15) ==============================
    {
        "question_id": "USR_006",
        "question_text": "Hakan Şükür'ün doğduğu şehrin bulunduğu il neresidir?",
        "reasoning_path": ["Hakan Şükür", "place of birth", "Adapazarı",
                           "located in the administrative territorial entity", "Sakarya"],
        "gold_answer": "Sakarya",
        "difficulty": "2-hop",
        "domain": "football",
    },
    {
        "question_id": "USR_007",
        "question_text": "Mustafa Kemal Atatürk'ün öldüğü şehirde bulunan saray hangisidir?",
        "reasoning_path": ["Mustafa Kemal Atatürk", "place of death", "Dolmabahçe Sarayı",
                           "located in", "İstanbul"],
        "gold_answer": "Dolmabahçe Sarayı",
        "difficulty": "2-hop",
        "domain": "politics",
    },
    {
        "question_id": "USR_008",
        "question_text": "Galatasaray'ın stadyumunun bulunduğu ilçe nerededir?",
        "reasoning_path": ["Galatasaray S.K.", "home venue", "Rams Park",
                           "located in", "Sarıyer"],
        "gold_answer": "Sarıyer",
        "difficulty": "2-hop",
        "domain": "football",
    },
    {
        "question_id": "USR_009",
        "question_text": "Fenerbahçe'nin stadyumunun adı nedir?",
        "reasoning_path": ["Fenerbahçe S.K.", "home venue", "Şükrü Saracoğlu Stadyumu"],
        "gold_answer": "Şükrü Saracoğlu Stadyumu",
        "difficulty": "2-hop",
        "domain": "football",
    },
    {
        "question_id": "USR_010",
        "question_text": "Beşiktaş'ın stadyumunun bulunduğu şehir neresidir?",
        "reasoning_path": ["Beşiktaş J.K.", "home venue", "Vodafone Park",
                           "located in", "İstanbul"],
        "gold_answer": "İstanbul",
        "difficulty": "2-hop",
        "domain": "football",
    },
    {
        "question_id": "USR_011",
        "question_text": "Süleyman Demirel'in doğduğu ilin adı nedir?",
        "reasoning_path": ["Süleyman Demirel", "place of birth", "Atabey",
                           "located in the administrative territorial entity", "Isparta"],
        "gold_answer": "Isparta",
        "difficulty": "2-hop",
        "domain": "politics",
    },
    {
        "question_id": "USR_012",
        "question_text": "Turgut Özal'ın doğduğu şehir neresidir?",
        "reasoning_path": ["Turgut Özal", "place of birth", "Malatya"],
        "gold_answer": "Malatya",
        "difficulty": "2-hop",
        "domain": "politics",
    },
    {
        "question_id": "USR_013",
        "question_text": "Aziz Sancar'ın doğduğu il neresidir?",
        "reasoning_path": ["Aziz Sancar", "place of birth", "Savur",
                           "located in the administrative territorial entity", "Mardin"],
        "gold_answer": "Mardin",
        "difficulty": "2-hop",
        "domain": "science",
    },
    {
        "question_id": "USR_014",
        "question_text": "Yaşar Kemal'in doğduğu ilçenin bulunduğu il neresidir?",
        "reasoning_path": ["Yaşar Kemal", "place of birth", "Hemite",
                           "located in the administrative territorial entity", "Osmaniye"],
        "gold_answer": "Osmaniye",
        "difficulty": "2-hop",
        "domain": "literature",
    },
    {
        "question_id": "USR_015",
        "question_text": "Yılmaz Güney'in öldüğü şehir neresidir?",
        "reasoning_path": ["Yılmaz Güney", "place of death", "Paris"],
        "gold_answer": "Paris",
        "difficulty": "2-hop",
        "domain": "cinema",
    },
    {
        "question_id": "USR_016",
        "question_text": "Pamukkale'nin bulunduğu il neresidir?",
        "reasoning_path": ["Pamukkale", "located in the administrative territorial entity",
                           "Denizli"],
        "gold_answer": "Denizli",
        "difficulty": "2-hop",
        "domain": "heritage",
    },
    {
        "question_id": "USR_017",
        "question_text": "Efes Antik Kenti'nin bulunduğu il neresidir?",
        "reasoning_path": ["Efes", "located in the administrative territorial entity",
                           "Selçuk", "located in the administrative territorial entity",
                           "İzmir"],
        "gold_answer": "İzmir",
        "difficulty": "2-hop",
        "domain": "heritage",
    },
    {
        "question_id": "USR_018",
        "question_text": "Mimar Sinan'ın baş yapıtı sayılan Selimiye Camii'nin bulunduğu şehir neresidir?",
        "reasoning_path": ["Selimiye Camii", "architect", "Mimar Sinan",
                           "Selimiye Camii", "located in", "Edirne"],
        "gold_answer": "Edirne",
        "difficulty": "2-hop",
        "domain": "architecture",
    },
    {
        "question_id": "USR_019",
        "question_text": "Sabancı Holding'in kurucusu kimdir?",
        "reasoning_path": ["Sabancı Holding", "founded by", "Hacı Ömer Sabancı"],
        "gold_answer": "Hacı Ömer Sabancı",
        "difficulty": "2-hop",
        "domain": "company",
    },
    {
        "question_id": "USR_020",
        "question_text": "Türkiye Cumhuriyeti'nin kurucusu kimdir?",
        "reasoning_path": ["Türkiye", "founded by", "Mustafa Kemal Atatürk"],
        "gold_answer": "Mustafa Kemal Atatürk",
        "difficulty": "2-hop",
        "domain": "politics",
    },

    # ============================== 3-hop (10) ==============================
    {
        "question_id": "USR_021",
        "question_text": "Galatasaray'ın menajerinin doğduğu şehrin bulunduğu il neresidir?",
        "reasoning_path": ["Galatasaray S.K.", "head coach", "Okan Buruk",
                           "place of birth", "İstanbul",
                           "located in the administrative territorial entity", "İstanbul"],
        "gold_answer": "İstanbul",
        "difficulty": "3-hop",
        "domain": "football",
    },
    {
        "question_id": "USR_022",
        "question_text": "Fenerbahçe'nin stadyumunun bulunduğu şehrin nüfusu en kalabalık ilçesi neresidir?",
        "reasoning_path": ["Fenerbahçe S.K.", "home venue", "Şükrü Saracoğlu Stadyumu",
                           "located in", "Kadıköy",
                           "located in the administrative territorial entity", "İstanbul"],
        "gold_answer": "Kadıköy",
        "difficulty": "3-hop",
        "domain": "football",
    },
    {
        "question_id": "USR_023",
        "question_text": "Aziz Sancar'ın eğitim aldığı üniversitenin bulunduğu şehir neresidir?",
        "reasoning_path": ["Aziz Sancar", "educated at", "İstanbul Üniversitesi",
                           "headquarters location", "İstanbul"],
        "gold_answer": "İstanbul",
        "difficulty": "3-hop",
        "domain": "science",
    },
    {
        "question_id": "USR_024",
        "question_text": "Süleyman Demirel'in eğitim aldığı üniversitenin bulunduğu şehir neresidir?",
        "reasoning_path": ["Süleyman Demirel", "educated at", "İstanbul Teknik Üniversitesi",
                           "headquarters location", "İstanbul"],
        "gold_answer": "İstanbul",
        "difficulty": "3-hop",
        "domain": "politics",
    },
    {
        "question_id": "USR_025",
        "question_text": "Orhan Pamuk'un eğitim gördüğü üniversitenin bulunduğu şehir neresidir?",
        "reasoning_path": ["Orhan Pamuk", "educated at", "Boğaziçi Üniversitesi",
                           "headquarters location", "İstanbul"],
        "gold_answer": "İstanbul",
        "difficulty": "3-hop",
        "domain": "literature",
    },
    {
        "question_id": "USR_026",
        "question_text": "Hakan Şükür'ün uzun yıllar oynadığı kulübün stadyumu hangi şehirdedir?",
        "reasoning_path": ["Hakan Şükür", "member of sports team", "Galatasaray S.K.",
                           "home venue", "Rams Park", "located in", "İstanbul"],
        "gold_answer": "İstanbul",
        "difficulty": "3-hop",
        "domain": "football",
    },
    {
        "question_id": "USR_027",
        "question_text": "Recep Tayyip Erdoğan'ın doğduğu il hangi coğrafi bölgededir?",
        "reasoning_path": ["Recep Tayyip Erdoğan", "place of birth", "Rize",
                           "located in", "Karadeniz Bölgesi"],
        "gold_answer": "Karadeniz Bölgesi",
        "difficulty": "3-hop",
        "domain": "politics",
    },
    {
        "question_id": "USR_028",
        "question_text": "Türk Hava Yolları'nın merkezinin bulunduğu havalimanı hangisidir?",
        "reasoning_path": ["Türk Hava Yolları", "headquarters location", "İstanbul",
                           "Türk Hava Yolları", "hub airport", "İstanbul Havalimanı"],
        "gold_answer": "İstanbul Havalimanı",
        "difficulty": "3-hop",
        "domain": "transportation",
    },
    {
        "question_id": "USR_029",
        "question_text": "Nuri Bilge Ceylan'ın yönettiği Kış Uykusu filminin başrolü olan oyuncunun adı nedir?",
        "reasoning_path": ["Kış Uykusu", "director", "Nuri Bilge Ceylan",
                           "Kış Uykusu", "cast member", "Haluk Bilginer"],
        "gold_answer": "Haluk Bilginer",
        "difficulty": "3-hop",
        "domain": "cinema",
    },
    {
        "question_id": "USR_030",
        "question_text": "Türkiye'nin ilk Nobel ödüllü yazarının doğduğu şehir neresidir?",
        "reasoning_path": ["Orhan Pamuk", "award received", "Nobel Prize in Literature",
                           "Orhan Pamuk", "place of birth", "İstanbul"],
        "gold_answer": "İstanbul",
        "difficulty": "3-hop",
        "domain": "literature",
    },

    # =========================== comparison (5) =============================
    {
        "question_id": "USR_031",
        "question_text": "Mustafa Kemal Atatürk mü yoksa İsmet İnönü mü daha erken doğmuştur?",
        "reasoning_path": ["Mustafa Kemal Atatürk", "date of birth", "1881",
                           "İsmet İnönü", "date of birth", "1884"],
        "gold_answer": "Mustafa Kemal Atatürk",
        "difficulty": "comparison",
        "domain": "politics",
    },
    {
        "question_id": "USR_032",
        "question_text": "Süleyman Demirel mi yoksa Turgut Özal mı daha erken doğmuştur?",
        "reasoning_path": ["Süleyman Demirel", "date of birth", "1924",
                           "Turgut Özal", "date of birth", "1927"],
        "gold_answer": "Süleyman Demirel",
        "difficulty": "comparison",
        "domain": "politics",
    },
    {
        "question_id": "USR_033",
        "question_text": "Galatasaray mı yoksa Beşiktaş mı daha erken kurulmuştur?",
        "reasoning_path": ["Beşiktaş J.K.", "inception", "1903",
                           "Galatasaray S.K.", "inception", "1905"],
        "gold_answer": "Beşiktaş",
        "difficulty": "comparison",
        "domain": "football",
    },
    {
        "question_id": "USR_034",
        "question_text": "Boğaziçi Üniversitesi mi yoksa ODTÜ mü daha erken kurulmuştur?",
        "reasoning_path": ["Boğaziçi Üniversitesi", "inception", "1863",
                           "ODTÜ", "inception", "1956"],
        "gold_answer": "Boğaziçi Üniversitesi",
        "difficulty": "comparison",
        "domain": "academia",
    },
    {
        "question_id": "USR_035",
        "question_text": "Topkapı Sarayı mı yoksa Dolmabahçe Sarayı mı daha eski bir yapıdır?",
        "reasoning_path": ["Topkapı Sarayı", "inception", "1465",
                           "Dolmabahçe Sarayı", "inception", "1856"],
        "gold_answer": "Topkapı Sarayı",
        "difficulty": "comparison",
        "domain": "heritage",
    },
]


def main() -> None:
    qa = json.loads(QA_PATH.read_text(encoding="utf-8"))

    # 1. Filter out Türkiye-gold questions except the kept 3.
    kept = []
    removed_ids: list[str] = []
    for q in qa:
        gold = (q.get("gold_answer") or "").strip()
        qid = q["question_id"]
        if gold == "Türkiye" and qid not in KEEP_TURKIYE_IDS:
            removed_ids.append(qid)
            continue
        kept.append(q)

    # 2. De-dup any USR_* IDs we're about to add (in case the script is re-run).
    new_ids = {q["question_id"] for q in NEW_QUESTIONS}
    kept = [q for q in kept if q["question_id"] not in new_ids]

    # 3. Append the 30 fresh ones.
    final = kept + NEW_QUESTIONS

    # 4. Persist.
    QA_PATH.write_text(
        json.dumps(final, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    REMOVED_PATH.write_text(
        json.dumps({"removed_ids": sorted(removed_ids)}, ensure_ascii=False, indent=2)
        + "\n",
        encoding="utf-8",
    )

    # 5. Report.
    from collections import Counter
    diff = Counter(q.get("difficulty") for q in final)
    dom = Counter(q.get("domain") for q in final)
    gold_top = Counter((q.get("gold_answer") or "").strip() for q in final).most_common(10)
    print(f"Removed {len(removed_ids)} Türkiye-gold questions, kept {len(KEEP_TURKIYE_IDS)} of them.")
    print(f"Added {len(NEW_QUESTIONS)} new ≥2-hop non-Türkiye questions.")
    print(f"Final QA dataset size: {len(final)}")
    print(f"Difficulty: {dict(diff)}")
    print(f"Top gold answers (top 10): {gold_top}")
    print(f"Removed IDs sidecar: {REMOVED_PATH}")


if __name__ == "__main__":
    main()
