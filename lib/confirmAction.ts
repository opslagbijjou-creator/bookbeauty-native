import { Alert, Platform } from "react-native";

type ConfirmActionOptions = {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
};

export async function confirmAction(options: ConfirmActionOptions): Promise<boolean> {
  if (Platform.OS === "web") {
    const confirmFn = (globalThis as { confirm?: (message?: string) => boolean }).confirm;
    if (typeof confirmFn !== "function") return true;
    return confirmFn(`${options.title}\n\n${options.message}`);
  }

  return new Promise((resolve) => {
    let settled = false;
    const done = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    Alert.alert(
      options.title,
      options.message,
      [
        {
          text: options.cancelText ?? "Annuleren",
          style: "cancel",
          onPress: () => done(false),
        },
        {
          text: options.confirmText ?? "Bevestigen",
          style: options.destructive ? "destructive" : "default",
          onPress: () => done(true),
        },
      ],
      {
        cancelable: true,
        onDismiss: () => done(false),
      }
    );
  });
}
