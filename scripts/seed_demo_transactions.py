import asyncio
import logging
import os
import sys
import pandas as pd
from datetime import datetime, timezone
from sqlalchemy import select, delete

# Add root and backend directories to python path
sys.path.insert(0, os.path.abspath("."))
sys.path.insert(0, os.path.abspath("backend"))

from app.core.database import async_session_factory
from app.models.transaction import Transaction
from app.models.audit import AuditLog
from app.models.ai_report import AIReport
from app.services.ml_service import get_default_service
from scripts.generate_demo_data import generate_data

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("seed_demo_transactions")


async def seed_transactions():
    """
    Clears demo transaction tables and populates PostgreSQL with genuinely scored transactions.
    Scores every transaction using the real serialized Random Forest ML model (MLService).
    """
    csv_path = "data/transactions.csv"
    if not os.path.exists(csv_path):
        logger.info("Generating demo transaction CSV dataset at %s...", csv_path)
        generate_data(csv_path, num_records=1000)
        
    df = pd.read_csv(csv_path)
    logger.info("Loaded %d transactions from %s", len(df), csv_path)
    
    # Initialize ML Service
    svc = get_default_service()
    svc.ensure_loaded()
    # Use empty history context for batch seeding speed (lookups on customer_id)
    svc.df_history = pd.DataFrame()

    async with async_session_factory() as session:
        logger.info("Safely clearing demo records from transactions, ai_reports, and scoring audit_logs...")
        await session.execute(delete(AIReport))
        await session.execute(delete(Transaction))
        await session.execute(
            delete(AuditLog).where(AuditLog.event.in_(["TRANSACTION_SCORED", "AI_INVESTIGATION_GENERATED"]))
        )
        await session.commit()
        counts = {"LOW": 0, "MEDIUM": 0, "HIGH": 0, "CRITICAL": 0}
        hero_tx_scored = None

        logger.info("Scoring transactions using real ML model...")
        txns_to_add = []
        audits_to_add = []

        for _, row in df.iterrows():
            tx_dict = row.to_dict()
            
            # Ensure df_history remains empty during synthetic batch scoring
            svc.df_history = pd.DataFrame()
            prediction = svc.predict(tx_dict)
            counts[prediction.risk_level] += 1
            
            # Create Transaction model
            txn = Transaction(
                transaction_id=str(row["transaction_id"]),
                customer_id=str(row["customer_id"]),
                merchant_id=str(row["merchant_id"]),
                amount=float(row["amount"]),
                currency=str(row.get("currency", "INR")),
                status="scored",
                device_id=str(row["device_id"]),
                payment_method=str(row["payment_method"]),
                country=str(row["country"]),
                fraud_probability=float(prediction.fraud_probability),
                risk_level=str(prediction.risk_level),
                decision=str(prediction.decision),
                model_version=str(prediction.model_version),
                scored_at=prediction.scored_at,
                risk_signals=list(prediction.risk_signals),
                created_at=pd.to_datetime(row["timestamp"]).to_pydatetime()
            )
            txns_to_add.append(txn)

            # Audit event
            audit = AuditLog(
                event="TRANSACTION_SCORED",
                actor="system_demo_seeder",
                transaction_id=str(row["transaction_id"]),
                timestamp=prediction.scored_at,
                metadata_={
                    "model_version": prediction.model_version,
                    "risk_level": prediction.risk_level,
                    "decision": prediction.decision,
                    "fraud_probability": prediction.fraud_probability,
                    "threshold": prediction.threshold,
                },
                details=f"Demo transaction scored via ML pipeline with risk level {prediction.risk_level}."
            )
            audits_to_add.append(audit)

            if str(row["transaction_id"]) == "TXN_HERO_FRAUD_001":
                hero_tx_scored = prediction

        session.add_all(txns_to_add)
        session.add_all(audits_to_add)



        # Pre-cache AI Investigation report for hero transaction TXN_HERO_FRAUD_001
        if hero_tx_scored:
            logger.info("Creating pre-cached AI investigation report for hero transaction TXN_HERO_FRAUD_001...")
            hero_report = AIReport(
                transaction_id="TXN_HERO_FRAUD_001",
                summary="High-risk account takeover attempt detected for transaction TXN_HERO_FRAUD_001. Multiple critical risk indicators triggered including unusual device, foreign IP location, and repeated failed authentication attempts.",
                key_evidence=[
                    "4 consecutive failed authentication attempts preceding transaction",
                    "Transaction initiated from unrecognized device DEV_HERO_FRAUD_88",
                    "Unusual transaction country (US vs primary location IN)",
                    "Payment method changed to credit card",
                    "High amount transaction (₹2,45,000.00) on young account (12 days age)",
                    "Unusual transaction hour (02:30 UTC / 08:00 IST)"
                ],
                risk_reasoning="The transaction exhibits classic high-velocity account takeover patterns: multiple prior failed login/transaction attempts followed by a high-value card transaction from an unrecognized device and foreign IP region.",
                recommended_action="BLOCK_AND_HOLD",
                confidence=0.95,
                limitations=[
                    f"Model fraud probability score is {hero_tx_scored.fraud_probability * 100:.1f}%.",
                    "5 independent real-time behavioral signals confirmed.",
                    "External cardholder verification recommended before account unlock."
                ],
                is_mock=True
            )
            session.add(hero_report)

        await session.commit()
        
        logger.info("\n==================================================")
        logger.info("DEMO DATASET SEEDING COMPLETE")
        logger.info("==================================================")
        logger.info("Total Transactions Inserted into PostgreSQL: %d", len(df))
        logger.info("Actual Scored ML Risk Distribution:")
        for lvl, cnt in counts.items():
            pct = (cnt / len(df)) * 100
            logger.info("  %-10s: %4d (%5.1f%%)", lvl, cnt, pct)

        if hero_tx_scored:
            logger.info("\nHero Fraud Transaction Verification (TXN_HERO_FRAUD_001):")
            logger.info("  Probability : %.4f (>= 90%%: %s)", hero_tx_scored.fraud_probability, hero_tx_scored.fraud_probability >= 0.90)
            logger.info("  Risk Level  : %s", hero_tx_scored.risk_level)
            logger.info("  Decision    : %s", hero_tx_scored.decision)
            logger.info("  Signals (%d) : %s", len(hero_tx_scored.risk_signals), hero_tx_scored.risk_signals)

if __name__ == "__main__":
    asyncio.run(seed_transactions())
