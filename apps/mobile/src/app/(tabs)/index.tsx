import { useState } from "react";
import { ScrollView, View } from "react-native";
import { authClient } from "@/auth/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { api } from "@/utils/api";

export default function HomeScreen() {
  const { data: session } = authClient.useSession();
  const [healthStatus, setHealthStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const checkHealth = async () => {
    setLoading(true);
    try {
      const response = await api.health.$get();
      if (response.ok) {
        const text = await response.text();
        setHealthStatus(text);
      } else {
        setHealthStatus("Unhealthy");
      }
    } catch (error) {
      console.error("Failed to check health:", error);
      setHealthStatus("Unreachable");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView className="bg-background flex-1 p-4">
      <View className="gap-4">
        <Text className="text-2xl font-bold">Saleslip Mobile</Text>

        <Card>
          <CardHeader>
            <CardTitle>User Session</CardTitle>
          </CardHeader>
          <CardContent>
            {session ? (
              <View className="gap-1">
                <Text>Signed in as: {session.user.email}</Text>
                <Text>Name: {session.user.name}</Text>
              </View>
            ) : (
              <Text className="text-muted-foreground">Not signed in</Text>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System Health</CardTitle>
          </CardHeader>
          <CardContent className="gap-3">
            <Text>
              Status:{" "}
              {loading ? "Checking..." : (healthStatus ?? "Not checked yet")}
            </Text>
            <Button onPress={checkHealth} disabled={loading}>
              <Text className="text-primary-foreground">Check API Health</Text>
            </Button>
          </CardContent>
        </Card>
      </View>
    </ScrollView>
  );
}
