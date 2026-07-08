import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid,
} from '@react-native-community/datetimepicker';

function fmt(d: Date): string {
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Date + time picker. iOS shows an inline picker toggled by tapping the value;
 * Android chains the native date then time dialogs. `onClear` (when provided)
 * makes the field optional (used for a poll's end time).
 */
export default function DateTimeField({
  value,
  onChange,
  onClear,
  minimumDate,
  placeholder = 'Set date & time',
}: {
  value: Date | null;
  onChange: (d: Date) => void;
  onClear?: () => void;
  minimumDate?: Date;
  placeholder?: string;
}) {
  const [showIOS, setShowIOS] = useState(false);

  function openAndroid() {
    DateTimePickerAndroid.open({
      value: value ?? new Date(),
      mode: 'date',
      minimumDate,
      onChange: (_, date) => {
        if (!date) return;
        DateTimePickerAndroid.open({
          value: date,
          mode: 'time',
          onChange: (__, dt) => dt && onChange(dt),
        });
      },
    });
  }

  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-2">
        <Pressable
          onPress={() =>
            Platform.OS === 'android' ? openAndroid() : setShowIOS((s) => !s)
          }
          className="flex-1 rounded-skin border-skin border-border px-4 py-3">
          <Text className={value ? 'font-sans text-ink' : 'font-sans text-muted'}>
            {value ? fmt(value) : placeholder}
          </Text>
        </Pressable>
        {onClear && value ? (
          <Pressable onPress={onClear} className="px-2 py-3">
            <Text className="font-sans text-sm text-muted">Clear</Text>
          </Pressable>
        ) : null}
      </View>

      {Platform.OS === 'ios' && showIOS ? (
        <DateTimePicker
          value={value ?? new Date()}
          mode="datetime"
          display="inline"
          minimumDate={minimumDate}
          onChange={(_, date) => date && onChange(date)}
        />
      ) : null}
    </View>
  );
}
