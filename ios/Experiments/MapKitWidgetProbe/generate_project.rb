require 'xcodeproj'
require 'fileutils'

Dir.chdir(__dir__)
abort 'Project already exists; remove only the generated probe project before regenerating.' if File.exist?('MapKitWidgetProbe.xcodeproj')
project = Xcodeproj::Project.new('MapKitWidgetProbe.xcodeproj')
app = project.new_target(:application, 'MapKitProbe', :ios, '26.0')
widget = project.new_target(:app_extension, 'MapKitProbeWidget', :ios, '26.0')

[[app, 'App/ProbeApp.swift'], [widget, 'Widget/ProbeWidget.swift']].each do |target, path|
  target.source_build_phase.add_file_reference(project.main_group.new_file(path))
end
shared = project.main_group.new_file('Shared/ProbeNavigation.swift')
navigation = project.main_group.new_file('../../../plugins/inspection-alarm-kit/ios/Sources/InspectionAlarmKitPlugin/AgendaWidgetStore.swift')
[app, widget].each do |target|
  target.source_build_phase.add_file_reference(shared)
  target.source_build_phase.add_file_reference(navigation)
  target.build_configurations.each do |config|
    config.build_settings.merge!({
      'SWIFT_VERSION' => '5.0', 'SDKROOT' => 'iphoneos',
      'TARGETED_DEVICE_FAMILY' => '1', 'CODE_SIGN_STYLE' => 'Automatic',
      'GENERATE_INFOPLIST_FILE' => 'YES', 'CURRENT_PROJECT_VERSION' => '1',
      'MARKETING_VERSION' => '0.1', 'SUPPORTED_PLATFORMS' => 'iphoneos iphonesimulator',
      'INFOPLIST_KEY_CFBundleDisplayName' => 'MV MapKit Probe',
      'LD_RUNPATH_SEARCH_PATHS' => '$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks'
    })
  end
end
app.build_configurations.each do |config|
  config.build_settings.merge!({
    'PRODUCT_BUNDLE_IDENTIFIER' => 'it.mvtechcore.mvanager.mapkitprobe',
    'INFOPLIST_FILE' => 'App/Info.plist',
    'SWIFT_ACTIVE_COMPILATION_CONDITIONS' => '$(inherited) PROBE_APP',
    'INFOPLIST_KEY_UIApplicationSceneManifest_Generation' => 'YES',
    'INFOPLIST_KEY_UILaunchScreen_Generation' => 'YES'
  })
end
widget.build_configurations.each do |config|
  config.build_settings.merge!({
    'PRODUCT_BUNDLE_IDENTIFIER' => 'it.mvtechcore.mvanager.mapkitprobe.widget',
    'APPLICATION_EXTENSION_API_ONLY' => 'YES', 'SKIP_INSTALL' => 'YES',
    'GENERATE_INFOPLIST_FILE' => 'NO', 'INFOPLIST_FILE' => 'Widget/Info.plist'
  })
end
app.add_dependency(widget)
embed = app.new_copy_files_build_phase('Embed App Extensions')
embed.dst_subfolder_spec = '13'
embed.add_file_reference(widget.product_reference).settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }
project.save
scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(app)
scheme.set_launch_target(app)
scheme.save_as(project.path, 'MapKitProbe', true)
