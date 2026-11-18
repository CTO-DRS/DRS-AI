import { useEffect, useState } from 'react';
import { BarChart3, Users, MessageSquare, Cpu, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { adminService } from '@/services/api';
import { SystemStats } from '@/types';
import { toast } from 'sonner';

export default function Analytics() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const response = await adminService.getStats();
      setStats(response.data);
    } catch (error) {
      toast.error('Failed to load analytics');
    } finally {
      setIsLoading(false);
    }
  };

  const statCards = [
    {
      title: 'Total Users',
      value: stats?.users.total || 0,
      change: `+${stats?.users.activeToday || 0} active today`,
      icon: Users,
      color: 'from-blue-500 to-cyan-500'
    },
    {
      title: 'Conversations',
      value: stats?.conversations || 0,
      change: 'Total chats',
      icon: MessageSquare,
      color: 'from-green-500 to-emerald-500'
    },
    {
      title: 'Messages',
      value: stats?.messages || 0,
      change: 'Total messages',
      icon: BarChart3,
      color: 'from-purple-500 to-pink-500'
    },
    {
      title: 'Memories',
      value: stats?.memories || 0,
      change: 'Stored memories',
      icon: Cpu,
      color: 'from-orange-500 to-red-500'
    }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Analytics</h1>
        <p className="text-muted-foreground mt-2">
          Platform usage and performance metrics
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card) => (
          <Card key={card.title}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{card.title}</p>
                  <p className="text-3xl font-bold mt-1">
                    {isLoading ? '-' : card.value.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {card.change}
                  </p>
                </div>
                <div className={`w-12 h-12 bg-gradient-to-br ${card.color} rounded-lg flex items-center justify-center`}>
                  <card.icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Usage Trends</CardTitle>
          </CardHeader>
          <CardContent className="h-64 flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <TrendingUp className="w-12 h-12 mx-auto mb-4" />
              <p>Usage analytics coming soon</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Model Performance</CardTitle>
          </CardHeader>
          <CardContent className="h-64 flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <Cpu className="w-12 h-12 mx-auto mb-4" />
              <p>Model analytics coming soon</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
