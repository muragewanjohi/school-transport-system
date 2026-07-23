import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:http/http.dart' as http;
import 'package:parent_app/services/supabase_service.dart';

class RelocateScreen extends StatefulWidget {
  final String studentId;
  final String studentName;
  final LatLng initialLocation;

  const RelocateScreen({
    super.key,
    required this.studentId,
    required this.studentName,
    required this.initialLocation,
  });

  @override
  State<RelocateScreen> createState() => _RelocateScreenState();
}

class _RelocateScreenState extends State<RelocateScreen> {
  final MapController _mapController = MapController();
  final TextEditingController _searchController = TextEditingController();

  late LatLng _currentHomeLocation;
  bool _isSaving = false;
  bool _isSearching = false;
  List<Map<String, dynamic>> _searchResults = [];

  static const String _googleMapsApiKey = "AIzaSyA_placeholder_key_for_dev";

  @override
  void initState() {
    super.initState();
    _currentHomeLocation = widget.initialLocation;
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _searchPlace(String query) async {
    if (query.trim().isEmpty) {
      setState(() {
        _searchResults = [];
        _isSearching = false;
      });
      return;
    }

    setState(() => _isSearching = true);

    try {
      final List<Map<String, dynamic>> combined = [];

      // 1. Google Places Autocomplete API Search
      try {
        final googleUrl = Uri.parse(
            'https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${Uri.encodeComponent(query)}&components=country:ke&key=$_googleMapsApiKey');
        final gRes = await http.get(googleUrl);
        if (gRes.statusCode == 200) {
          final Map<String, dynamic> gData = json.decode(gRes.body);
          if (gData['predictions'] != null) {
            for (var item in gData['predictions']) {
              // Fetch place geometry details
              final placeId = item['place_id'];
              final detailsUrl = Uri.parse(
                  'https://maps.googleapis.com/maps/api/place/details/json?place_id=$placeId&fields=geometry,formatted_address,name&key=$_googleMapsApiKey');
              final detRes = await http.get(detailsUrl);
              if (detRes.statusCode == 200) {
                final Map<String, dynamic> detData = json.decode(detRes.body);
                if (detData['result'] != null && detData['result']['geometry'] != null) {
                  final loc = detData['result']['geometry']['location'];
                  combined.add({
                    'display_name': detData['result']['formatted_address'] ?? item['description'],
                    'title': detData['result']['name'] ?? item['structured_formatting']['main_text'],
                    'lat': (loc['lat'] as num).toDouble(),
                    'lon': (loc['lng'] as num).toDouble(),
                  });
                }
              }
            }
          }
        }
      } catch (_) {}

      // 2. Nominatim Kenya Building/Landmark DB Search Fallback
      try {
        final nomUrl = Uri.parse(
            'https://nominatim.openstreetmap.org/search?q=${Uri.encodeComponent('$query, Kenya')}&format=json&addressdetails=1&limit=6&countrycodes=ke');
        final nomRes = await http.get(nomUrl, headers: {
          'User-Agent': 'SchoolTrackParentApp/1.0',
        });
        if (nomRes.statusCode == 200) {
          final List<dynamic> nomData = json.decode(nomRes.body);
          for (var item in nomData) {
            final addr = item['address'] ?? {};
            final bName = addr['building'] ?? addr['amenity'] ?? addr['shop'] ?? addr['office'] ?? (item['display_name'] as String).split(',')[0];
            combined.add({
              'display_name': '$bName - ${item['display_name']}',
              'title': bName,
              'lat': double.parse(item['lat']),
              'lon': double.parse(item['lon']),
            });
          }
        }
      } catch (_) {}

      if (mounted) {
        setState(() {
          _searchResults = combined;
        });
      }
    } catch (e) {
      print('Error searching place: $e');
    } finally {
      if (mounted) {
        setState(() => _isSearching = false);
      }
    }
  }

  void _selectSearchResult(double lat, double lon, {String? displayName}) {
    final newPos = LatLng(lat, lon);
    setState(() {
      _currentHomeLocation = newPos;
      _searchResults = [];
    });
    if (displayName != null && displayName.isNotEmpty) {
      _searchController.text = displayName;
    } else {
      _searchController.clear();
    }
    _mapController.move(newPos, 16.0);
    FocusScope.of(context).unfocus();
  }

  Future<void> _saveHomeLocation() async {
    setState(() => _isSaving = true);

    final success = await SupabaseService.updateStudentPickupLocation(
      widget.studentId,
      _currentHomeLocation.latitude,
      _currentHomeLocation.longitude,
    );

    setState(() => _isSaving = false);

    if (mounted) {
      if (success) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Home location updated successfully!'),
            backgroundColor: Color(0xFF10B981),
            behavior: SnackBarBehavior.floating,
          ),
        );
        Navigator.of(context).pop(true);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Failed to update home location. Please try again.'),
            backgroundColor: Colors.red,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    // Google Maps Vector/Roadmap style tile url template
    final String googleMapsUrlTemplate =
        'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';

    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        title: Text(
          'Relocate ${widget.studentName}\'s Home',
          style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.white, fontSize: 18),
        ),
        backgroundColor: const Color(0xFF0A0E1A),
        foregroundColor: Colors.white,
        elevation: 0,
      ),
      body: Stack(
        children: [
          // 1. Google Maps Canvas
          FlutterMap(
            mapController: _mapController,
            options: MapOptions(
              initialCenter: _currentHomeLocation,
              initialZoom: 16.0,
              onTap: (tapPosition, point) {
                setState(() {
                  _currentHomeLocation = point;
                });
              },
            ),
            children: [
              TileLayer(
                urlTemplate: googleMapsUrlTemplate,
                userAgentPackageName: 'com.schooltrack.parent_app',
              ),
              MarkerLayer(
                markers: [
                  Marker(
                    point: _currentHomeLocation,
                    width: 70,
                    height: 70,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 44,
                          height: 44,
                          decoration: BoxDecoration(
                            color: const Color(0xFF2563EB),
                            shape: BoxShape.circle,
                            border: Border.all(color: Colors.white, width: 3),
                            boxShadow: [
                              BoxShadow(
                                color: const Color(0xFF2563EB).withOpacity(0.4),
                                blurRadius: 10,
                                offset: const Offset(0, 4),
                              )
                            ],
                          ),
                          child: const Icon(
                            Icons.home_rounded,
                            color: Colors.white,
                            size: 26,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Container(
                          width: 8,
                          height: 8,
                          decoration: const BoxDecoration(
                            color: Color(0xFF2563EB),
                            shape: BoxShape.circle,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),

          // 2. Search Bar & Dropdown Overlay
          Positioned(
            top: 16,
            left: 16,
            right: 16,
            child: Column(
              children: [
                Container(
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.1),
                        blurRadius: 12,
                        offset: const Offset(0, 4),
                      )
                    ],
                  ),
                  child: TextField(
                    controller: _searchController,
                    onChanged: (val) {
                      _searchPlace(val);
                    },
                    decoration: InputDecoration(
                      hintText: 'Search place, estate, or landmark...',
                      hintStyle: const TextStyle(color: Color(0xFF94A3B8), fontSize: 14),
                      prefixIcon: const Icon(Icons.search, color: Color(0xFF2563EB)),
                      suffixIcon: _searchController.text.isNotEmpty
                          ? IconButton(
                              icon: const Icon(Icons.clear, color: Colors.grey),
                              onPressed: () {
                                _searchController.clear();
                                setState(() {
                                  _searchResults = [];
                                });
                              },
                            )
                          : null,
                      border: InputBorder.none,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                    ),
                  ),
                ),
                if (_isSearching)
                  Container(
                    margin: const EdgeInsets.only(top: 8),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                        SizedBox(width: 10),
                        Text('Searching location...', style: TextStyle(color: Colors.grey)),
                      ],
                    ),
                  ),
                if (_searchResults.isNotEmpty)
                  Container(
                    margin: const EdgeInsets.only(top: 8),
                    constraints: const BoxConstraints(maxHeight: 220),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(16),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.1),
                          blurRadius: 12,
                          offset: const Offset(0, 4),
                        )
                      ],
                    ),
                    child: ListView.separated(
                      shrinkWrap: true,
                      itemCount: _searchResults.length,
                      separatorBuilder: (context, index) => const Divider(height: 1),
                      itemBuilder: (context, index) {
                        final place = _searchResults[index];
                        return ListTile(
                          onTap: () => _selectSearchResult(place['lat'], place['lon'], displayName: place['display_name']),
                          leading: const Icon(Icons.location_on, color: Color(0xFF2563EB)),
                          title: Text(
                            place['display_name'],
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 13, color: Color(0xFF0F172A)),
                          ),
                        );
                      },
                    ),
                  ),
              ],
            ),
          ),

          // 3. Instructions & Save Panel at Bottom
          Positioned(
            bottom: 24,
            left: 16,
            right: 16,
            child: Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(24),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.1),
                    blurRadius: 16,
                    offset: const Offset(0, 6),
                  )
                ],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Row(
                    children: [
                      Icon(Icons.touch_app_rounded, color: Color(0xFF2563EB)),
                      SizedBox(width: 8),
                      Text(
                        'Set Home Pickup Location',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF0F172A),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Tap anywhere on the map or search an address above to reposition your home pin.',
                    style: TextStyle(fontSize: 13, color: Color(0xFF64748B)),
                  ),
                  const SizedBox(height: 16),
                  Container(
                    height: 52,
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [Color(0xFF10B981), Color(0xFF059669)],
                      ),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: ElevatedButton(
                      onPressed: _isSaving ? null : _saveHomeLocation,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.transparent,
                        shadowColor: Colors.transparent,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16),
                        ),
                      ),
                      child: _isSaving
                          ? const SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(
                                color: Colors.white,
                                strokeWidth: 2.5,
                              ),
                            )
                          : const Text(
                              'CONFIRM & SAVE HOME LOCATION',
                              style: TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.bold,
                                letterSpacing: 0.5,
                              ),
                            ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
