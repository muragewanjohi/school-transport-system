import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:parent_app/screens/student_info_screen.dart';

void main() {
  testWidgets('shows editable name and school record', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: StudentInfoScreen(
          student: {
            'id': 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            'name': 'Joyland student 1',
            'grade': 'Grade 2',
            'class_name': 'Nile',
            'address': 'Kiambu Road',
            'status': 'Present',
            'tenant': {'name': 'Azima'},
          },
          onSave: (id, {required name, address}) async => true,
          photoUploader: ({required id, required imageBytes, required fileName}) async => null,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Student Information'), findsOneWidget);
    expect(find.text('Joyland student 1'), findsOneWidget);
    expect(find.text('Azima'), findsOneWidget);
    expect(find.text('Grade 2 Nile'), findsOneWidget);
    expect(find.text('Save changes'), findsOneWidget);
  });

  testWidgets('save pops with success when onSave succeeds', (tester) async {
    var saved = false;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) {
            return Scaffold(
              body: TextButton(
                onPressed: () async {
                  final result = await Navigator.of(context).push<bool>(
                    MaterialPageRoute(
                      builder: (_) => StudentInfoScreen(
                        student: {
                          'id': 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
                          'name': 'Joyland student 1',
                          'grade': '2',
                          'status': 'Present',
                        },
                        onSave: (id, {required name, address}) async {
                          saved = true;
                          return true;
                        },
                      ),
                    ),
                  );
                  if (result == true && context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('closed-with-true')),
                    );
                  }
                },
                child: const Text('open'),
              ),
            );
          },
        ),
      ),
    );

    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Save changes'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Save changes'));
    await tester.pumpAndSettle();

    expect(saved, isTrue);
    expect(find.text('open'), findsOneWidget);
  });
}
