import joblib
import os
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, IsolationForest
import numpy as np

class BaseModelWrapper:
    """Base class for all models, implementing clean serializing."""
    
    def __init__(self, model):
        self.model = model
        
    def fit(self, X, y):
        self.model.fit(X, y)
        return self
        
    def predict(self, X):
        return self.model.predict(X)
        
    def predict_proba(self, X):
        # Base implementation for models supporting probabilities
        return self.model.predict_proba(X)[:, 1]

    def save(self, filepath: str):
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        joblib.dump(self, filepath)
        print(f"Model saved to: {filepath}")

    @classmethod
    def load(cls, filepath: str):
        return joblib.load(filepath)

class LogisticRegressionWrapper(BaseModelWrapper):
    """Baseline Logistic Regression Model."""
    def __init__(self, C=0.1, random_state=42):
        model = LogisticRegression(
            C=C,
            class_weight="balanced",
            random_state=random_state,
            max_iter=1000,
            solver="liblinear"
        )
        super().__init__(model)

class RandomForestWrapper(BaseModelWrapper):
    """Primary Random Forest Classifier."""
    def __init__(self, n_estimators=100, max_depth=10, random_state=42):
        model = RandomForestClassifier(
            n_estimators=n_estimators,
            max_depth=max_depth,
            class_weight="balanced",
            random_state=random_state,
            n_jobs=-1
        )
        super().__init__(model)

class AnomalyModelWrapper(BaseModelWrapper):
    """Comparison anomaly model using Isolation Forest."""
    def __init__(self, contamination=0.03, random_state=42):
        model = IsolationForest(
            contamination=contamination,
            random_state=random_state,
            n_jobs=-1
        )
        super().__init__(model)
        
    def fit(self, X, y=None):
        self.model.fit(X)
        return self
        
    def predict(self, X):
        # Isolation Forest predicts -1 for anomalies and 1 for normal
        # Map: anomaly (-1) -> fraud (1), normal (1) -> legit (0)
        preds = self.model.predict(X)
        return np.where(preds == -1, 1, 0)
        
    def predict_proba(self, X):
        # Isolation Forest uses decision function where lower values mean anomaly
        # Map: decision scores to 0-1 range (invert so lower score -> higher prob)
        scores = self.model.decision_function(X)
        # Shift and scale decision score to a pseudo-probability between 0 and 1
        min_s, max_s = -0.5, 0.5
        probs = 1.0 - (scores - min_s) / (max_s - min_s)
        return np.clip(probs, 0.0, 1.0)
