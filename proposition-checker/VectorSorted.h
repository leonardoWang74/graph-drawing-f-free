
#include <vector>
#include <string>

template <typename T, typename Compare = std::less<T>>
class VectorSorted {
public:
    using iterator = typename std::vector<T>::iterator;
    using const_iterator = typename std::vector<T>::const_iterator;

    explicit VectorSorted(Compare comp = Compare{})
        : comp_(comp) {}

    // 

    // Binary search: returns iterator to element or end()
    const_iterator find(const T& value) const {
        auto it = lower_bound(value);
        if (it != data_.end() && !comp_(value, *it) && !comp_(*it, value)) {
            return it;
        }
        return data_.end();
    }

    iterator find(const T& value) {
        auto it = lower_bound(value);
        if (it != data_.end() && !comp_(value, *it) && !comp_(*it, value)) {
            return it;
        }
        return data_.end();
    }

    // Insert while keeping vector sorted
    iterator insert(const T& value) {
        auto it = lower_bound(value);
        return data_.insert(it, value);
    }

    // helpers
    size_t size() const { return data_.size(); }
    bool empty() const { return data_.empty(); }

    const T& operator[](size_t i) const { return data_[i]; }
    T& operator[](size_t i) { return data_[i]; }

    const_iterator begin() const { return data_.begin(); }
    const_iterator end() const { return data_.end(); }

private:
    std::vector<T> data_;
    Compare comp_;

    // binary search
    iterator lower_bound(const T& value) {
        return std::lower_bound(data_.begin(), data_.end(), value, comp_);
    }

    const_iterator lower_bound(const T& value) const {
        return std::lower_bound(data_.begin(), data_.end(), value, comp_);
    }
};