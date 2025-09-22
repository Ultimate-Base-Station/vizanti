#include <memory>
#include <string>
#include <map>

#include "rclcpp/rclcpp.hpp"
#include "tf2_msgs/msg/tf_message.hpp"

class TfStaticConsolidator : public rclcpp::Node {
public:
  TfStaticConsolidator() : Node("vizanti_tf_static_consolidator"), updated(false) {
    // Subscription QoS: same as tf_static (latched transient local)
    auto sub_qos = rclcpp::QoS(rclcpp::KeepLast(1))
      .reliability(RMW_QOS_POLICY_RELIABILITY_RELIABLE)
      .durability(RMW_QOS_POLICY_DURABILITY_TRANSIENT_LOCAL);

    tf_sub = create_subscription<tf2_msgs::msg::TFMessage>(
      "/tf_static",
      sub_qos,
      std::bind(&TfStaticConsolidator::tf_callback, this, std::placeholders::_1)
    );

    // Publisher QoS: match the requested static TF profile
    auto pub_qos = rclcpp::QoS(rclcpp::KeepLast(1))
      .reliability(RMW_QOS_POLICY_RELIABILITY_RELIABLE)
      .durability(RMW_QOS_POLICY_DURABILITY_TRANSIENT_LOCAL);

    tf_pub = create_publisher<tf2_msgs::msg::TFMessage>(
      "/vizanti/tf_static_consolidated",
      pub_qos
    );

    RCLCPP_INFO(get_logger(), "TF static consolidator ready.");
  }

private:
  bool updated;
  std::map<std::string, geometry_msgs::msg::TransformStamped> transforms;

  rclcpp::Subscription<tf2_msgs::msg::TFMessage>::SharedPtr tf_sub;
  rclcpp::Publisher<tf2_msgs::msg::TFMessage>::SharedPtr tf_pub;

  void tf_callback(const tf2_msgs::msg::TFMessage::SharedPtr msg) {
    for (const auto &transform : msg->transforms) {
      transforms[transform.child_frame_id] = transform;
      RCLCPP_INFO_THROTTLE(
        get_logger(),
        *get_clock(),
        5000,
        "Received static TF: %s -> %s",
        transform.header.frame_id.c_str(),
        transform.child_frame_id.c_str()
      );
    }
    publish();  // publish immediately after update
  }

  void publish() {
    auto msg = tf2_msgs::msg::TFMessage();
    for (const auto &entry : transforms) {
      msg.transforms.push_back(entry.second);
    }
    tf_pub->publish(msg);
    updated = false;

    RCLCPP_INFO(get_logger(), "Published consolidated static TFs: %zu", msg.transforms.size());
  }
};

int main(int argc, char *argv[]) {
  rclcpp::init(argc, argv);
  rclcpp::spin(std::make_shared<TfStaticConsolidator>());
  rclcpp::shutdown();
  return 0;
}