import { useEffect, useState } from 'react';
import { Activity, Database, Server } from 'lucide-react';
import { api } from '../services/api';

interface HealthStatus {
  status: string;
  database: string;
  redis: string;
}

export default function DashboardPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);

  useEffect(() => {
    api.get('/system/health')
      .then((res) => setHealth(res.data))
      .catch((err: any) => {
        if (err.response?.data) setHealth(err.response.data);
      });
  }, []);


  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white tracking-tight">System Status</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatusCard 
          title="Overall API" 
          icon={<Activity size={20} />} 
          status={health?.status} 
        />
        <StatusCard 
          title="PostgreSQL" 
          icon={<Database size={20} />} 
          status={health?.database} 
        />
        <StatusCard 
          title="Redis" 
          icon={<Server size={20} />} 
          status={health?.redis} 
        />
      </div>
    </div>
  );
}

function StatusCard({ title, icon, status }: { title: string; icon: React.ReactNode; status?: string }) {
  const isHealthy = status === 'healthy';
  
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-slate-400 font-medium">{title}</h3>
        <div className="text-slate-500">{icon}</div>
      </div>
      <div className="flex items-center gap-2">
        <div className={`w-3 h-3 rounded-full ${isHealthy ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
        <span className="text-lg font-semibold text-white capitalize">{status || 'Checking...'}</span>
      </div>
    </div>
  );
}
