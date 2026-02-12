import { useEffect } from "react";
import { useRouter } from "expo-router";
import { View } from "react-native";

export default function TabsIndex() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/" as any);
  }, [router]);

  return <View style={{ flex: 1, backgroundColor: "black" }} />;
}